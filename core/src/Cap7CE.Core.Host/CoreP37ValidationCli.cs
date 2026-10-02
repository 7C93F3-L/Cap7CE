using System.Security.Principal;
using System.Text.Json;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Protocol;
using Cap7CE.Core.Reader.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Host;

public sealed record CoreP37ValidationReport(
    string Status,
    bool InitialReady,
    bool OfflineObserved,
    bool OnlineCatchUp,
    bool JournalRebuild,
    bool ReaderInterrupted,
    bool ReaderRestartRecovery,
    bool CorruptCatalogRejected,
    bool CatalogCleanupOk,
    bool SourceFilesRead,
    bool ReaderSourceVolumeWritten,
    bool NetworkUsed,
    string? ErrorStage);

public static class CoreP37ValidationCli
{
    private const string DisplayName = "R:";

    public static async Task<CoreP37ValidationReport> RunAsync(CancellationToken token)
    {
        RequireStandardClient();
        var coordination = CoreP37ProbeCoordination.Open();
        var databasePath = Path.Combine(coordination.CatalogRoot, "catalog.db");
        var initialReady = false;
        var offlineObserved = false;
        var onlineCatchUp = false;
        var journalRebuild = false;
        var readerInterrupted = false;
        var readerRestartRecovery = false;
        var corruptCatalogRejected = false;
        var cleanup = false;
        var stage = "catalog-create";
        var resultStatus = "failed";
        string? resultError = null;
        try
        {
            Directory.CreateDirectory(coordination.CatalogRoot);
            await using (var runtime = new ProductCoreRuntime(
                new CatalogV2Database(databasePath), new ReaderV2CatalogSessionFactory()))
            {
                await runtime.InitializeAsync(token);
                stage = "initial-build";
                var discovered = await runtime.DiscoverVolumesAsync(token);
                var volume = discovered.Volumes.SingleOrDefault(value => value.DisplayName == DisplayName)
                    ?? throw new InvalidDataException("p37-volume-not-discovered");
                await runtime.SelectVolumesAsync(new VolumeSelectionRequest([volume.VolumeId]), token);
                var initial = await WaitTaskAsync(runtime,
                    runtime.StartSynchronization(new CatalogBuildRequest([volume.VolumeId]), false), token);
                var initialStatus = await ReadVolumeAsync(runtime, volume.VolumeId, token);
                var initialItems = await QueryAsync(runtime, coordination.Token, volume.VolumeId, token);
                initialReady = initialStatus.State == "ready" && initialStatus.Queryable
                    && initial.Measurements.Any(value => value.Kind == "initial")
                    && initialItems.Items.Count >= 2;
                if (!initialReady) throw new InvalidDataException("p37-initial-state");
                coordination.WriteState("initial-complete");

                stage = "offline";
                await coordination.WaitForAdminAsync("volume-offline", token);
                _ = await WaitTaskAsync(runtime,
                    runtime.StartSynchronization(new CatalogBuildRequest([volume.VolumeId]), false), token);
                var offline = await ReadVolumeAsync(runtime, volume.VolumeId, token);
                offlineObserved = offline.State == "offline" && !offline.Queryable;
                if (!offlineObserved) throw new InvalidDataException("p37-offline-state");
                coordination.WriteState("offline-observed");

                stage = "online-catch-up";
                await coordination.WaitForAdminAsync("volume-online", token);
                _ = await runtime.DiscoverVolumesAsync(token);
                var online = await WaitTaskAsync(runtime,
                    runtime.StartSynchronization(new CatalogBuildRequest([volume.VolumeId]), false), token);
                var onlineStatus = await ReadVolumeAsync(runtime, volume.VolumeId, token);
                var onlineItems = await QueryAsync(runtime, "p37-online-" + coordination.Token, volume.VolumeId, token);
                onlineCatchUp = onlineStatus.State == "ready" && onlineStatus.Queryable
                    && online.Measurements.Any(value => value.Kind == "incremental")
                    && onlineItems.Items.Count == 1;
                if (!onlineCatchUp) throw new InvalidDataException("p37-online-state");
                coordination.WriteState("online-complete");

                stage = "journal-rebuild";
                await coordination.WaitForAdminAsync("journal-replaced", token);
                var journal = await WaitTaskAsync(runtime,
                    runtime.StartSynchronization(new CatalogBuildRequest([volume.VolumeId]), false), token);
                var journalStatus = await ReadVolumeAsync(runtime, volume.VolumeId, token);
                var journalItems = await QueryAsync(runtime, "p37-journal-" + coordination.Token, volume.VolumeId, token);
                journalRebuild = journalStatus.State == "ready" && journalStatus.Queryable
                    && journal.Measurements.Any(value => value.Kind == "rebuild")
                    && journalItems.Items.Count == 1;
                if (!journalRebuild) throw new InvalidDataException("p37-journal-state");
                coordination.WriteState("journal-complete");

                stage = "reader-interruption";
                await Task.Delay(500, token);
                await using (var reader = await new ReaderV2CatalogSessionFactory().ConnectAsync(token))
                {
                    coordination.WriteState("reader-connected");
                    await coordination.WaitForAdminAsync("reader-stopped", token);
                    try
                    {
                        _ = await reader.ListVolumesAsync(token);
                    }
                    catch (Exception error) when (error is IOException or ReaderProtocolException)
                    {
                        readerInterrupted = true;
                    }
                }
                if (!readerInterrupted) throw new InvalidDataException("p37-reader-not-interrupted");

                stage = "reader-restart";
                var recovery = await WaitTaskAsync(runtime,
                    runtime.StartSynchronization(new CatalogBuildRequest([volume.VolumeId]), false), token);
                var recovered = await ReadVolumeAsync(runtime, volume.VolumeId, token);
                readerRestartRecovery = recovered.State == "ready" && recovered.Queryable
                    && recovery.Status.State == "completed";
                if (!readerRestartRecovery) throw new InvalidDataException("p37-reader-restart");
                await runtime.ShutdownAsync();
            }

            stage = "catalog-corruption";
            SqliteConnection.ClearAllPools();
            var originalLength = new FileInfo(databasePath).Length;
            await using (var stream = new FileStream(databasePath, FileMode.Open, FileAccess.Write, FileShare.None))
            {
                await stream.WriteAsync(new byte[128], token);
                stream.Flush(flushToDisk: true);
            }
            try
            {
                await new CatalogV2Database(databasePath).InitializeAsync(token);
            }
            catch (Exception error) when (error is SqliteException or CatalogSchemaException)
            {
                corruptCatalogRejected = new FileInfo(databasePath).Length == originalLength;
            }
            if (!corruptCatalogRejected) throw new InvalidDataException("p37-corrupt-catalog-accepted");
            stage = "complete";
            resultStatus = "passed";
        }
        catch (Exception error) when (error is not OutOfMemoryException and not OperationCanceledException)
        {
            resultError = stage + ":" + error.GetType().Name;
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            try { cleanup = coordination.DeleteCatalogRoot(); }
            catch { cleanup = false; }
            coordination.WriteState("client-complete");
        }
        return new CoreP37ValidationReport(
            resultStatus, initialReady, offlineObserved, onlineCatchUp, journalRebuild,
            readerInterrupted, readerRestartRecovery, corruptCatalogRejected, cleanup,
            false, false, false, resultError);
    }

    public static string Serialize(CoreP37ValidationReport report) => JsonSerializer.Serialize(report);

    private static async Task<(CoreCatalogTaskStatus Status, IReadOnlyList<CatalogSynchronizationMeasurement> Measurements)>
        WaitTaskAsync(ProductCoreRuntime runtime, CatalogBuildResponse task, CancellationToken token)
    {
        if (!task.Accepted) throw new InvalidDataException("p37-task-rejected");
        while (true)
        {
            token.ThrowIfCancellationRequested();
            var current = (await runtime.ReadStatusAsync(token)).Tasks.Single(value => value.TaskId == task.TaskId);
            if (current.State == "completed") return (current, runtime.ReadTaskMeasurements(task.TaskId));
            if (current.State != "running") throw new InvalidDataException(current.ErrorCode ?? "p37-task-failed");
            await Task.Delay(100, token);
        }
    }

    private static async Task<CoreVolumeStatus> ReadVolumeAsync(
        ProductCoreRuntime runtime, string volumeId, CancellationToken token) =>
        (await runtime.ReadStatusAsync(token)).Volumes.Single(value => value.VolumeId == volumeId);

    private static Task<CatalogV2QueryPage> QueryAsync(
        ProductCoreRuntime runtime, string query, string volumeId, CancellationToken token) =>
        runtime.Catalog.QueryAsync(new CatalogV2Query(
            query, [volumeId], CatalogQueryScope.AllVolumes(), null, CatalogEntryType.Any, 20, null), token);

    private static void RequireStandardClient()
    {
        using var identity = WindowsIdentity.GetCurrent();
        if (identity.User is null
            || new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))
        {
            throw new UnauthorizedAccessException("p37-client-must-be-standard");
        }
    }
}
