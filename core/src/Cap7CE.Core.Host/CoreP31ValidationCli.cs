using System.Diagnostics;
using System.Security.Principal;
using System.Text.Json;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Protocol;
using Cap7CE.Core.Reader.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Host;

public sealed record CoreP31ValidationReport(
    string Status,
    int Volumes,
    long InitialRecords,
    double ColdStartMs,
    double InitialBuildMs,
    double WarmStartMs,
    double IncrementalMs,
    double RebuildMs,
    double QueryMs,
    long CatalogBytes,
    long PeakWorkingSetBytes,
    bool ClosedPeriodChangesCaughtUp,
    bool RenameStable,
    bool MoveStable,
    bool DeleteRemoved,
    bool BasicFactsConsistent,
    bool DirectChildrenPassed,
    bool DescendantsPassed,
    bool SavedScopePassed,
    bool PagingPassed,
    bool DiscontinuityDetected,
    bool RebuildPassed,
    bool CatalogIntegrityOk,
    bool ControlledFixtureCleanupOk,
    bool CatalogCleanupOk,
    bool SourceFilesRead,
    bool ReaderSourceVolumeWritten,
    bool NetworkUsed,
    string? ErrorStage,
    bool InitialOnly = false,
    bool InitialBuildPassed = false,
    int InitialPages = 0,
    double InitialReaderReadMs = 0,
    double InitialStagingWriteMs = 0,
    double InitialDirectoryPathMs = 0,
    double InitialPublishMs = 0,
    bool InitialSizePassed = false,
    bool InitialCreatedTimePassed = false,
    bool InitialModifiedTimePassed = false,
    bool InitialAttributesPassed = false);

public static class CoreP31ValidationCli
{
    public static async Task<CoreP31ValidationReport> RunAsync(
        CancellationToken token,
        bool initialOnly = false)
    {
        RequireStandardClient();
        const string driveRoot = "E:\\";
        var drive = new DriveInfo(driveRoot);
        if (!drive.IsReady || drive.DriveType != DriveType.Fixed
            || !string.Equals(drive.DriveFormat, "NTFS", StringComparison.OrdinalIgnoreCase))
        {
            throw new NotSupportedException("p31-authorized-volume-unavailable");
        }

        var tokenText = Guid.NewGuid().ToString("N");
        var fixtureRoot = Path.Combine(driveRoot, "Cap7CE-P31-Probe-" + tokenText);
        var nested = Path.Combine(fixtureRoot, "nested");
        var renameBefore = Path.Combine(fixtureRoot, tokenText + "-rename.png");
        var renameAfter = Path.Combine(fixtureRoot, tokenText + "-renamed.png");
        var deletePath = Path.Combine(fixtureRoot, tokenText + "-delete.txt");
        var moveBefore = Path.Combine(fixtureRoot, tokenText + "-move.psd");
        var moveAfter = Path.Combine(nested, tokenText + "-moved.psd");
        var catalogRoot = Path.Combine(Path.GetTempPath(), "Cap7CE-Core-P31-Real-" + Guid.NewGuid().ToString("N"));
        var databasePath = Path.Combine(catalogRoot, "catalog.db");
        var stage = "fixture-create";
        var fixtureCleanup = false;
        var catalogCleanup = false;
        try
        {
            Directory.CreateDirectory(nested);
            await File.WriteAllBytesAsync(renameBefore, Enumerable.Repeat((byte)0x31, 257).ToArray(), token);
            await File.WriteAllBytesAsync(deletePath, Enumerable.Repeat((byte)0x32, 97).ToArray(), token);
            await File.WriteAllBytesAsync(moveBefore, Enumerable.Repeat((byte)0x33, 513).ToArray(), token);
            Directory.CreateDirectory(catalogRoot);

            var readerFactory = new ReaderV2CatalogSessionFactory();
            var cold = Stopwatch.StartNew();
            await using (var runtime = new ProductCoreRuntime(new CatalogV2Database(databasePath), readerFactory))
            {
                await runtime.InitializeAsync(token);
                var list = await runtime.DiscoverVolumesAsync(token);
                var authorized = list.Volumes.SingleOrDefault(volume => volume.DisplayName == "E:")
                    ?? throw new InvalidDataException("p31-authorized-volume-not-discovered");
                await runtime.SelectVolumesAsync(new VolumeSelectionRequest([authorized.VolumeId]), token);
                cold.Stop();

                stage = "initial-build";
                var initialWatch = Stopwatch.StartNew();
                var initialMeasurements = await WaitTaskAsync(runtime,
                    runtime.StartSynchronization(new CatalogBuildRequest([authorized.VolumeId]), false), token);
                initialWatch.Stop();
                var initialMeasurement = initialMeasurements.Single(measurement => measurement.Kind == "initial");
                var initialStatus = (await runtime.ReadStatusAsync(token)).Volumes.Single(volume =>
                    volume.VolumeId == authorized.VolumeId);
                if (!initialStatus.Queryable || initialStatus.Processed <= 0)
                {
                    throw new InvalidDataException("p31-initial-build-state");
                }

                if (initialOnly)
                {
                    stage = "initial-queries";
                    var initialQueryWatch = Stopwatch.StartNew();
                    var initialRename = await QueryAsync(runtime.Catalog, tokenText + "-rename", authorized.VolumeId, token);
                    var initialMove = await QueryAsync(runtime.Catalog, tokenText + "-move", authorized.VolumeId, token);
                    var initialDelete = await QueryAsync(runtime.Catalog, tokenText + "-delete", authorized.VolumeId, token);
                    var initialRoot = await QueryAsync(runtime.Catalog, "Cap7CE-P31-Probe-" + tokenText, authorized.VolumeId, token);
                    var initialRootEntry = initialRoot.Items.Single(item => item.IsDirectory && item.Name.EndsWith(tokenText, StringComparison.Ordinal));
                    var renameEntry = initialRename.Items.Single();
                    var initialDirect = await runtime.Catalog.GetChildrenAsync(initialRootEntry.Identity, 20, null, token);
                    var initialDescendants = await runtime.Catalog.QueryAsync(new CatalogV2Query(
                        tokenText,
                        [authorized.VolumeId],
                        CatalogQueryScope.Descendants(initialRootEntry.Identity.VolumeId, initialRootEntry.Identity.FileReference),
                        null,
                        CatalogEntryType.Any,
                        20,
                        null), token);
                    var initialPaged = await CountPagedAsync(runtime.Catalog, tokenText, authorized.VolumeId, token);
                    initialQueryWatch.Stop();
                    var initialIntegrity = await runtime.Catalog.CheckIntegrityAsync(token);
                    var initialBytes = await runtime.Catalog.ReadStorageBytesAsync(token);
                    var initialPeak = Process.GetCurrentProcess().PeakWorkingSet64;
                    var sizePassed = renameEntry.SizeBytes == 257;
                    var createdTimePassed = renameEntry.CreatedUtcTicks is > 0;
                    var modifiedTimePassed = renameEntry.ModifiedUtcTicks is > 0;
                    var attributesPassed = renameEntry.Attributes is > 0;
                    var facts = sizePassed && createdTimePassed && modifiedTimePassed && attributesPassed;
                    var initialPassed = initialRename.Items.Count == 1
                        && initialMove.Items.Count == 1
                        && initialDelete.Items.Count == 1
                        && initialDirect.Items.Count == 4
                        && initialDescendants.Items.Count == 4
                        && initialPaged == 5
                        && facts
                        && initialIntegrity;

                    stage = "fixture-cleanup";
                    fixtureCleanup = DeleteControlledDirectory(fixtureRoot, driveRoot, "Cap7CE-P31-Probe-");
                    await runtime.ShutdownAsync();
                    SqliteConnection.ClearAllPools();
                    catalogCleanup = DeleteControlledDirectory(
                        catalogRoot, Path.GetTempPath(), "Cap7CE-Core-P31-Real-");
                    initialPassed = initialPassed && fixtureCleanup && catalogCleanup;

                    return new CoreP31ValidationReport(
                        initialPassed ? "passed" : "failed",
                        list.Volumes.Count,
                        initialStatus.Processed,
                        Math.Round(cold.Elapsed.TotalMilliseconds, 1),
                        Math.Round(initialWatch.Elapsed.TotalMilliseconds, 1),
                        0,
                        0,
                        0,
                        Math.Round(initialQueryWatch.Elapsed.TotalMilliseconds, 1),
                        initialBytes,
                        initialPeak,
                        false,
                        false,
                        false,
                        false,
                        facts,
                        initialDirect.Items.Count == 4,
                        initialDescendants.Items.Count == 4,
                        false,
                        initialPaged == 5,
                        false,
                        false,
                        initialIntegrity,
                        fixtureCleanup,
                        catalogCleanup,
                        false,
                        false,
                        false,
                        initialPassed ? null : "initial-assertions",
                        true,
                        initialPassed,
                        initialMeasurement.Pages,
                        Math.Round(initialMeasurement.ReaderReadMilliseconds, 1),
                        Math.Round(initialMeasurement.StagingWriteMilliseconds, 1),
                        Math.Round(initialMeasurement.DirectoryPathMilliseconds, 1),
                        Math.Round(initialMeasurement.PublishMilliseconds, 1),
                        sizePassed,
                        createdTimePassed,
                        modifiedTimePassed,
                        attributesPassed);
                }

                await runtime.ShutdownAsync();
                File.Move(renameBefore, renameAfter);
                File.Move(moveBefore, moveAfter);
                File.Delete(deletePath);

                var warm = Stopwatch.StartNew();
                await using var reopened = new ProductCoreRuntime(new CatalogV2Database(databasePath), readerFactory);
                await reopened.InitializeAsync(token);
                warm.Stop();
                stage = "incremental";
                var incremental = Stopwatch.StartNew();
                await WaitTaskAsync(reopened,
                    reopened.StartSynchronization(new CatalogBuildRequest([authorized.VolumeId]), false), token);
                incremental.Stop();

                stage = "queries";
                var queryWatch = Stopwatch.StartNew();
                var renamed = await QueryAsync(reopened.Catalog, tokenText + "-renamed", authorized.VolumeId, token);
                var oldRename = await QueryAsync(reopened.Catalog, tokenText + "-rename.png", authorized.VolumeId, token);
                var moved = await QueryAsync(reopened.Catalog, tokenText + "-moved", authorized.VolumeId, token);
                var deleted = await QueryAsync(reopened.Catalog, tokenText + "-delete", authorized.VolumeId, token);
                var root = await QueryAsync(reopened.Catalog, "Cap7CE-P31-Probe-" + tokenText, authorized.VolumeId, token);
                queryWatch.Stop();
                var rootEntry = root.Items.Single(item => item.IsDirectory && item.Name.EndsWith(tokenText, StringComparison.Ordinal));
                var renamedEntry = renamed.Items.Single();
                var movedEntry = moved.Items.Single();
                var direct = await reopened.Catalog.GetChildrenAsync(rootEntry.Identity, 20, null, token);
                var descendants = await reopened.Catalog.QueryAsync(new CatalogV2Query(
                    tokenText,
                    [authorized.VolumeId],
                    CatalogQueryScope.Descendants(rootEntry.Identity.VolumeId, rootEntry.Identity.FileReference),
                    null,
                    CatalogEntryType.Any,
                    20,
                    null), token);
                await reopened.Catalog.SaveScopeAsync(new CatalogSavedScope(
                    "p31-controlled",
                    rootEntry.Identity,
                    DateTime.UtcNow.Ticks), token);
                var saved = await reopened.Catalog.QueryAsync(new CatalogV2Query(
                    tokenText,
                    [],
                    CatalogQueryScope.Saved("p31-controlled"),
                    null,
                    CatalogEntryType.Any,
                    20,
                    null), token);
                var paged = await CountPagedAsync(reopened.Catalog, tokenText, authorized.VolumeId, token);

                stage = "discontinuity";
                var discontinuity = false;
                await using (var reader = await readerFactory.ConnectAsync(token))
                {
                    var readerVolume = (await reader.ListVolumesAsync(token)).Single(volume => volume.DisplayName == "E:");
                    var inspection = await reader.InspectAsync(readerVolume, token);
                    try
                    {
                        _ = await reader.ReadJournalPageAsync(
                            readerVolume,
                            unchecked(inspection.JournalId + 1),
                            inspection.NextUsn,
                            1,
                            token);
                    }
                    catch (CatalogReaderDiscontinuityException)
                    {
                        discontinuity = true;
                    }
                }
                var rebuildWatch = Stopwatch.StartNew();
                await WaitTaskAsync(reopened,
                    reopened.StartSynchronization(new CatalogBuildRequest([authorized.VolumeId]), true), token);
                rebuildWatch.Stop();
                var rebuilt = await QueryAsync(reopened.Catalog, tokenText + "-renamed", authorized.VolumeId, token);
                var integrity = await reopened.Catalog.CheckIntegrityAsync(token);
                var bytes = await reopened.Catalog.ReadStorageBytesAsync(token);
                var peak = Process.GetCurrentProcess().PeakWorkingSet64;

                stage = "fixture-cleanup";
                fixtureCleanup = DeleteControlledDirectory(fixtureRoot, driveRoot, "Cap7CE-P31-Probe-");
                await reopened.ShutdownAsync();
                SqliteConnection.ClearAllPools();
                catalogCleanup = DeleteControlledDirectory(
                    catalogRoot, Path.GetTempPath(), "Cap7CE-Core-P31-Real-");

                return new CoreP31ValidationReport(
                    "passed",
                    list.Volumes.Count,
                    initialStatus.Processed,
                    Math.Round(cold.Elapsed.TotalMilliseconds, 1),
                    Math.Round(initialWatch.Elapsed.TotalMilliseconds, 1),
                    Math.Round(warm.Elapsed.TotalMilliseconds, 1),
                    Math.Round(incremental.Elapsed.TotalMilliseconds, 1),
                    Math.Round(rebuildWatch.Elapsed.TotalMilliseconds, 1),
                    Math.Round(queryWatch.Elapsed.TotalMilliseconds, 1),
                    bytes,
                    peak,
                    renamed.Items.Count == 1 && oldRename.Items.Count == 0 && moved.Items.Count == 1 && deleted.Items.Count == 0,
                    renamed.Items.Count == 1 && renamedEntry.Identity == rebuilt.Items.Single().Identity,
                    moved.Items.Count == 1 && movedEntry.RelativePath.EndsWith("nested\\" + movedEntry.Name, StringComparison.Ordinal),
                    deleted.Items.Count == 0,
                    renamedEntry.SizeBytes == 257 && renamedEntry.CreatedUtcTicks is > 0
                        && renamedEntry.ModifiedUtcTicks is > 0 && renamedEntry.Attributes is > 0,
                    direct.Items.Count == 2,
                    descendants.Items.Count == 3,
                    saved.Items.Count == 3,
                    paged == 4,
                    discontinuity,
                    rebuilt.Items.Count == 1,
                    integrity,
                    fixtureCleanup,
                    catalogCleanup,
                    false,
                    false,
                    false,
                    null);
            }
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            var errorType = error is CoreP31TaskException taskError
                ? taskError.ErrorCode
                : error.GetType().Name;
            return new CoreP31ValidationReport(
                "failed", 0, 0, 0, 0, 0, 0, 0, 0, 0,
                Process.GetCurrentProcess().PeakWorkingSet64,
                false, false, false, false, false, false, false, false, false,
                false, false, false, fixtureCleanup, catalogCleanup,
                false, false, false, stage + ":" + errorType,
                initialOnly);
        }
        finally
        {
            if (Directory.Exists(fixtureRoot))
            {
                try { _ = DeleteControlledDirectory(fixtureRoot, driveRoot, "Cap7CE-P31-Probe-"); }
                catch { }
            }
            if (Directory.Exists(catalogRoot))
            {
                SqliteConnection.ClearAllPools();
                try { _ = DeleteControlledDirectory(
                    catalogRoot, Path.GetTempPath(), "Cap7CE-Core-P31-Real-"); }
                catch { }
            }
        }
    }

    public static string Serialize(CoreP31ValidationReport report) => JsonSerializer.Serialize(report);

    private static async Task<IReadOnlyList<CatalogSynchronizationMeasurement>> WaitTaskAsync(
        ProductCoreRuntime runtime,
        CatalogBuildResponse task,
        CancellationToken token)
    {
        if (!task.Accepted) throw new InvalidDataException("p31-task-rejected");
        while (true)
        {
            token.ThrowIfCancellationRequested();
            var status = await runtime.ReadStatusAsync(token);
            var current = status.Tasks.Single(item => item.TaskId == task.TaskId);
            if (current.State == "completed") return runtime.ReadTaskMeasurements(task.TaskId);
            if (current.State != "running") throw new CoreP31TaskException(current.ErrorCode ?? "p31-task-failed");
            await Task.Delay(100, token);
        }
    }

    private sealed class CoreP31TaskException(string errorCode) : Exception(errorCode)
    {
        public string ErrorCode { get; } = errorCode;
    }

    private static Task<CatalogV2QueryPage> QueryAsync(
        CatalogV2Database catalog,
        string query,
        string volumeId,
        CancellationToken token) => catalog.QueryAsync(new CatalogV2Query(
            query,
            [volumeId],
            CatalogQueryScope.AllVolumes(),
            null,
            CatalogEntryType.Any,
            20,
            null), token);

    private static async Task<int> CountPagedAsync(
        CatalogV2Database catalog,
        string query,
        string volumeId,
        CancellationToken token)
    {
        CatalogQueryCursorKey? cursor = null;
        var count = 0;
        do
        {
            var page = await catalog.QueryAsync(new CatalogV2Query(
                query,
                [volumeId],
                CatalogQueryScope.AllVolumes(),
                null,
                CatalogEntryType.Any,
                2,
                cursor), token);
            count += page.Items.Count;
            cursor = page.Next;
        } while (cursor is not null);
        return count;
    }

    private static void RequireStandardClient()
    {
        using var identity = WindowsIdentity.GetCurrent();
        if (new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))
        {
            throw new UnauthorizedAccessException("p31-client-must-be-standard");
        }
    }

    private static bool DeleteControlledDirectory(
        string target,
        string expectedParent,
        string requiredNamePrefix)
    {
        var fullTarget = Path.GetFullPath(target).TrimEnd(Path.DirectorySeparatorChar);
        var fullParent = Path.GetFullPath(expectedParent).TrimEnd(Path.DirectorySeparatorChar);
        var actualParent = Path.GetDirectoryName(fullTarget)?.TrimEnd(Path.DirectorySeparatorChar);
        if (!string.Equals(actualParent, fullParent, StringComparison.OrdinalIgnoreCase)
            || !Path.GetFileName(fullTarget).StartsWith(requiredNamePrefix, StringComparison.Ordinal)
            || !Directory.Exists(fullTarget))
        {
            return !Directory.Exists(fullTarget);
        }
        var info = new DirectoryInfo(fullTarget);
        if (info.Attributes.HasFlag(FileAttributes.ReparsePoint))
        {
            throw new InvalidOperationException("p31-cleanup-reparse");
        }
        Directory.Delete(fullTarget, recursive: true);
        return !Directory.Exists(fullTarget);
    }
}
