using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Cap7CE.Core.Host;

namespace Cap7CE.Core.Tests;

internal static class CatalogCrossVolumeResumeTests
{
    public static async Task RunAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        var catalog = new CatalogV2Database(fixture.DatabasePath); await catalog.InitializeAsync(createEntryCatalog: true);
        var reader = new EntryCatalogReaderFixture();
        var sync = new CatalogSynchronizationService(catalog, reader, captureFileEntries: true);
        var volumes = await sync.DiscoverAsync(); var first = volumes.Single(v => v.DisplayName == "A:");
        var second = volumes.Single(v => v.DisplayName == "B:");
        await catalog.SetVolumeSelectionAsync([first.VolumeId, second.VolumeId]);
        await sync.SynchronizeAsync([], false);
        var before = (await catalog.ReadVolumeAsync(second.VolumeId))!;
        await catalog.BeginCatchUpAsync(second.VolumeId, before.JournalId!, before.JournalFirstUsn!.Value, before.JournalLowestValidUsn!.Value);
        reader.Base.RenameAndMove("B:", 20, 5, "resumed.png");
        var snapshots = reader.Base.SnapshotOpenCount;
        await sync.SynchronizeAsync([first.VolumeId, second.VolumeId], false);
        var after = (await catalog.ReadVolumeAsync(second.VolumeId))!;
        TestAssert.True(after.CheckpointUsn > before.CheckpointUsn, "a resumed volume advances after another volume changes the global revision");
        TestAssert.True((await catalog.ReadVolumesAsync()).All(v => v.State == CatalogV2VolumeState.Ready), "both volumes complete without a rebuild");
        TestAssert.Equal(snapshots, reader.Base.SnapshotOpenCount, "resuming a journal does not replace it with an MFT scan");
        var identity = new CatalogEntryIdentity(second.VolumeId, "0000000000000014");
        var entries = new CatalogFileEntryStore(catalog);
        TestAssert.Equal("resumed.png", (await entries.ReadAsync(identity))!.Entries.Single().Name, "resumed names publish normally");
        reader.Base.RenameAndMove("B:", 20, 5, "raced.png");
        reader.AfterJournalRead = async volume => {
            if (volume.CatalogId == second.VolumeId) await catalog.MarkOfflineAsync(first.VolumeId);
        };
        await TestAssert.ThrowsAsync<CatalogConcurrencyException>(() => sync.SynchronizeAsync([second.VolumeId], false), "a global writer after source observation still rejects the stale page");
        TestAssert.Equal(after.CheckpointUsn, (await catalog.ReadVolumeAsync(second.VolumeId))!.CheckpointUsn, "a concurrent writer cannot advance the observed checkpoint");
        TestAssert.Equal("resumed.png", (await entries.ReadAsync(identity))!.Entries.Single().Name, "a rejected observation cannot replace old names");
        reader.AfterJournalRead = null;
        await sync.SynchronizeAsync([second.VolumeId], false);
        TestAssert.Equal("raced.png", (await entries.ReadAsync(identity))!.Entries.Single().Name, "a new observation recovers the interrupted volume");
        TestAssert.True(await catalog.CheckIntegrityAsync(), "cross-volume resume and concurrency rejection retain integrity");
        Console.WriteLine("Cross-volume journal resume: interrupted later volume, fresh global observation fence, no rebuild, rejected concurrent writer, retained checkpoint/names and clean retry passed.");
    }
}
