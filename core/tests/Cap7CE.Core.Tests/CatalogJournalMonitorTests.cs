using System.Threading.Channels;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Host;
using Cap7CE.Core.Host.CatalogMaintenance;
using Cap7CE.Core.Host.MetadataExtraction;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogJournalMonitorTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-monitor-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        using var cancellation = new CancellationTokenSource(); Task? activeWork = null;
        try {
            var catalog = new CatalogV2Database(Path.Combine(root, "fixture.db")); await catalog.InitializeAsync();
            var synthetic = new SyntheticCatalogReader(); var sync = new CatalogSynchronizationService(catalog, synthetic);
            var volumes = await sync.DiscoverAsync(); await catalog.SetVolumeSelectionAsync(volumes.Select(volume => volume.VolumeId).ToArray());
            await sync.SynchronizeAsync([], false);
            var reader = new WaitingCatalogReader(synthetic); var time = new CatalogMonitorTime();
            var publications = Channel.CreateUnbounded<long>(); var resolves = 0;
            var impacts=new System.Collections.Concurrent.ConcurrentQueue<CatalogDirectoryImpact>();
            var diagnostics = new System.Collections.Concurrent.ConcurrentQueue<(string Name, System.Text.Json.JsonElement Data)>();
            var trace = new CatalogPreparationDiagnostics((name, data) => diagnostics.Enqueue((name, System.Text.Json.JsonSerializer.SerializeToElement(data))));
            var monitor = new CatalogJournalMonitor(catalog, reader, (ready, token) => {
                resolves++; return Task.FromResult<IReadOnlyList<FileFactOwnedStorageRoot>>([]);
            }, revision => publications.Writer.TryWrite(revision), time, diagnostics: trace,
                scopedPublished:impact=>{impacts.Enqueue(impact);publications.Writer.TryWrite(impact.Revision);});
            var work = monitor.RunAsync(cancellation.Token); activeWork = work;
            async Task Wait() => await reader.Waits.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(10));
            async Task Publication() => await publications.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(10));
            await Wait(); var baseline = await catalog.ReadRevisionAsync(); var initialInspections = reader.Inspections;
            reader.Pulses.Writer.TryWrite(true); await Wait();
            TestAssert.Equal(baseline, await catalog.ReadRevisionAsync(), "quiet timeout has no Catalog writes or notifications");
            TestAssert.Equal(initialInspections, reader.Inspections, "quiet timeout cannot start inspection polling");
            TestAssert.Equal(1, resolves, "quiet timeout cannot query owned directories again");
            TestAssert.Equal(0, diagnostics.Count, "quiet waits produce no diagnostic traffic");
            TestAssert.Equal(0, reader.PageOrder.Count, "quiet timeout never reads USN pages");
            for (var index = 0; index < 50; index++) synthetic.RenameAndMove("A:", 11, 10, "a-" + index + ".png");
            for (var index = 0; index < 4; index++) synthetic.RenameAndMove("B:", 20, 5, "b-" + index + ".jpg");
            reader.Pulses.Writer.TryWrite(false); await Wait();
            TestAssert.Equal("A:,B:,A:,B:", string.Join(',', reader.PageOrder.Take(4)), "cross-volume backlog pages are round-robin rather than starving later drives");
            TestAssert.Equal(27, reader.PageOrder.Count, "backlog larger than one sixteen-page turn drains without missing pages");
            TestAssert.True(impacts.Count>0&&impacts.Select(i=>i.VolumeId).Distinct().Count()==2,"journal monitor forwards committed impacts for both drives without rescanning");
            var page = await catalog.QueryAsync(new("a-49", [], CatalogQueryScope.AllVolumes(), null, CatalogEntryType.File, 10, null));
            TestAssert.Equal(1, page.Items.Count, "last external event is queryable after drain");
            TestAssert.Equal(1, reader.Connects, "page draining does not create competing Reader sessions");
            while (publications.Reader.TryRead(out _)) { }
            var snapshots = synthetic.SnapshotOpenCount;
            synthetic.BreakJournal("A:"); reader.Pulses.Writer.TryWrite(false); await Publication(); await Wait();
            TestAssert.Equal(snapshots + 1, synthetic.SnapshotOpenCount, "replaced journal rebuilds exactly the affected volume");
            TestAssert.Equal(1, reader.Connects, "completeness recovery reuses the authenticated Reader session");
            TestAssert.True((await catalog.ReadVolumesAsync()).All(volume => volume.State == CatalogV2VolumeState.Ready), "recovered Catalog remains queryable");
            var rebuild = diagnostics.Single(item => item.Name == "preparation-rebuild");
            TestAssert.Equal("journal-replaced", rebuild.Data.GetProperty("reason").GetString()!, "automatic recovery records the observed journal cause");
            TestAssert.Equal("A", rebuild.Data.GetProperty("driveLetter").GetString()!, "diagnostics retain only a drive letter");
            TestAssert.Equal("monitor-recovery", rebuild.Data.GetProperty("origin").GetString()!, "automatic recovery is distinguished from explicit operations");
            var completion = diagnostics.Single(item => item.Name == "preparation-completed");
            TestAssert.Equal(rebuild.Data.GetProperty("activityId").GetString()!, completion.Data.GetProperty("activityId").GetString()!, "recovery stages share one activity");
            foreach (var key in new[] { "readerReadMilliseconds", "stagingWriteMilliseconds", "directoryPathMilliseconds", "publishMilliseconds", "totalMilliseconds", "records", "pages" })
                TestAssert.True(completion.Data.GetProperty(key).GetDouble() >= 0, "completed recovery retains existing stage measurement " + key);
            time.Advance(TimeSpan.FromMinutes(26)); reader.Pulses.Writer.TryWrite(true); await Wait();
            TestAssert.Equal(2, reader.Connects, "native session is renewed before its maximum lifetime");
            TestAssert.Equal(1, reader.Disposals, "old session fully retires before renewed session starts");
            TestAssert.Equal(1, reader.MaximumActive, "renewal keeps one authenticated Reader owner");
            cancellation.Cancel(); await TestAssert.ThrowsAsync<OperationCanceledException>(() => work, "stop cancels native wait and awaits Reader retirement");
            TestAssert.Equal(0, reader.Active, "stopped monitor has no Reader session remaining");
            TestAssert.Equal(2, reader.Disposals, "every opened monitor session disposed");

            var unsupportedReader = new WaitingCatalogReader(synthetic) { Supported = false };
            var unsupported = new CatalogJournalMonitor(catalog, unsupportedReader, (ready, token) => Task.FromResult<IReadOnlyList<FileFactOwnedStorageRoot>>([]), _ => { });
            await TestAssert.ThrowsAsync<NotSupportedException>(() => unsupported.RunAsync(CancellationToken.None), "old Reader capability does not fall back to fast queries");
            TestAssert.Equal(1, unsupportedReader.Connects, "unsupported capability is attempted only once");
            TestAssert.Equal(1, unsupportedReader.Disposals, "unsupported Reader still disposed");
            await catalog.SetVolumeSelectionAsync([]);
            var idleReader = new WaitingCatalogReader(synthetic);
            await new CatalogJournalMonitor(catalog, idleReader, (ready, token) => Task.FromResult<IReadOnlyList<FileFactOwnedStorageRoot>>([]), _ => { }).RunAsync(CancellationToken.None);
            TestAssert.Equal(0, idleReader.Connects, "no selected ready volume means no Reader start or idle retry");
            TestAssert.True(await catalog.CheckIntegrityAsync(), "continuous owner Catalog integrity");
        }
        finally {
            if (activeWork is { IsCompleted: false }) {
                cancellation.Cancel();
                try { await activeWork; } catch (OperationCanceledException) { }
            }
            SqliteConnection.ClearAllPools(); Directory.Delete(root, true);
        }
    }
}
