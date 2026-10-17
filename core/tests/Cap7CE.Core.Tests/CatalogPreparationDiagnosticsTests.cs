using System.Collections.Concurrent;
using System.Text.Json;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Host;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogPreparationDiagnosticsTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-preparation-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try {
            var catalog = new CatalogV2Database(Path.Combine(root, "fixture.db")); await catalog.InitializeAsync();
            var reader = new SyntheticCatalogReader();
            var events = new ConcurrentQueue<(string Name, JsonElement Data)>();
            using var cancellation = new CancellationTokenSource();
            var cancelOnce = true;
            var diagnostics = new CatalogPreparationDiagnostics((name, data) => {
                var json = JsonSerializer.SerializeToElement(data); events.Enqueue((name, json));
                if (cancelOnce && name == "preparation-stage" && json.GetProperty("stage").GetString() == "snapshot-read-and-stage") {
                    cancelOnce = false; cancellation.Cancel();
                }
            });
            var sync = new CatalogSynchronizationService(catalog, reader, diagnostics);
            var volume = (await sync.DiscoverAsync()).First(); await catalog.SetVolumeSelectionAsync([volume.VolumeId]);
            await TestAssert.ThrowsAsync<OperationCanceledException>(() => sync.SynchronizeAsync([], false, cancellation.Token), "preparation cancellation is preserved");
            var cancelled = events.Single(item => item.Name == "preparation-cancelled");
            TestAssert.Equal("snapshot-read-and-stage", cancelled.Data.GetProperty("stage").GetString()!, "cancellation retains its active phase");
            await sync.SynchronizeAsync([], false);
            TestAssert.True(events.Any(item => item.Name == "preparation-rebuild" && item.Data.GetProperty("reason").GetString() == "interrupted-build"), "a later attempt explains the interrupted build");
            var completed = events.Single(item => item.Name == "preparation-completed");
            TestAssert.True(cancelled.Data.GetProperty("activityId").GetString() != completed.Data.GetProperty("activityId").GetString(), "each retry has a distinct correlation ID");

            var ready = (await catalog.ReadVolumesAsync()).Single(item => item.VolumeId == volume.VolumeId);
            await using (var session = await reader.ConnectAsync(CancellationToken.None)) {
                var native = (await session.ListVolumesAsync(CancellationToken.None)).Single(item => item.CatalogId == volume.VolumeId);
                var inspection = await session.InspectAsync(native, CancellationToken.None);
                TestAssert.True(CatalogPreparationDiagnostics.RebuildReason(ready, inspection) is null, "continuous checkpoint does not claim a rebuild cause");
                var checkpoint = ready.CheckpointUsn!.Value;
                TestAssert.Equal("checkpoint-expired", CatalogPreparationDiagnostics.RebuildReason(ready, inspection with { FirstUsn = checkpoint + 1 })!, "expired journal has a precise reason");
                TestAssert.Equal("checkpoint-invalidated", CatalogPreparationDiagnostics.RebuildReason(ready, inspection with { LowestValidUsn = checkpoint + 1 })!, "invalidated checkpoint has a precise reason");
                TestAssert.Equal("checkpoint-ahead", CatalogPreparationDiagnostics.RebuildReason(ready, inspection with { NextUsn = checkpoint - 1 })!, "ahead checkpoint has a precise reason");
            }
            reader.RenameAndMove("A:", 11, 10, "renamed.png"); reader.FailNextJournalReadAsDiscontinuous = true;
            await sync.SynchronizeAsync([], false);
            TestAssert.True(events.Any(item => item.Name == "preparation-retry"), "incremental discontinuity retry is visible");
            reader.FailNextSnapshotRead = true;
            await TestAssert.ThrowsAsync<IOException>(() => sync.SynchronizeAsync([], true), "Reader failure remains observable");
            TestAssert.True(events.Any(item => item.Name == "preparation-failed"), "failed preparation has a terminal event");
            var throwingSink = new CatalogSynchronizationService(catalog, reader, new CatalogPreparationDiagnostics((_, _) => throw new IOException("sink unavailable")));
            await throwingSink.SynchronizeAsync([], false);
            TestAssert.True(await catalog.CheckIntegrityAsync(), "diagnostics do not change Catalog recovery or integrity");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
}
