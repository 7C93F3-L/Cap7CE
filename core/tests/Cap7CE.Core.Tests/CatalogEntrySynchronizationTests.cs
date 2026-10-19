using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host;
using Cap7CE.Core.Host.CatalogMaintenance;
using Cap7CE.Core.Reader.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogEntrySynchronizationTests
{
    public static async Task RunAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        var catalog = new CatalogV2Database(fixture.DatabasePath); await catalog.InitializeAsync();
        var reader = new EntryCatalogReaderFixture();
        reader.Overrides[11] = EntryCatalogReaderFixture.Names(new(10, "alpha.png"), new(5, "alias.png"));
        var sync = new CatalogSynchronizationService(catalog, reader, captureFileEntries: true);
        var volumes = await sync.DiscoverAsync(); var volume = volumes.Single(volume => volume.DisplayName == "A:");
        await catalog.SetVolumeSelectionAsync([volume.VolumeId]);
        await sync.SynchronizeAsync([volume.VolumeId], false);
        var identity = new CatalogEntryIdentity(volume.VolumeId, "000000000000000B");
        var store = new CatalogFileEntryStore(catalog);
        TestAssert.Equal(2, (await store.ReadAsync(identity))!.Entries.Count, "initial snapshot publishes all hard-link names");
        TestAssert.Equal(2, (await QueryAsync(catalog)).Count(item => item.Identity == identity), "initial aliases participate in the real query");
        var facts = new FileFactDatabase(fixture.DatabasePath); await facts.InitializeAsync();
        var source = (await facts.CaptureAsync(identity))!;
        await facts.PublishAsync(new(identity, source, FileFactKind.ImageDimensions, 1, FileFactState.Indexed, 640, 480));
        reader.Base.Delete("A:", 11);
        reader.Overrides[11] = EntryCatalogReaderFixture.Names(new ReaderFileName(5, "alias.png"));
        await sync.SynchronizeAsync([volume.VolumeId], false);
        TestAssert.Equal("alias.png", (await QueryAsync(catalog)).Single(item => item.Identity == identity).Name, "closed-period FileDelete retains the live physical file");
        TestAssert.True(await facts.ReadCurrentAsync(identity, FileFactKind.ImageDimensions, 1) is not null, "removing a name preserves shared physical facts");
        await using var session = await reader.ConnectAsync(CancellationToken.None);
        var native = (await session.ListVolumesAsync(CancellationToken.None)).Single(v => v.CatalogId == volume.VolumeId);
        var capture = new CatalogDirectoryEntryCapture(session, native);
        async Task<CatalogJournalPageOwner> Owner() => await CatalogJournalPageOwner.CreateAsync(catalog,
            (await catalog.ReadVolumeAsync(volume.VolumeId))!, [], captureEntries: capture.CaptureJournalAsync);
        var before = (await catalog.ReadVolumeAsync(volume.VolumeId))!;
        var page = DeletePage(before);
        reader.Overrides[11] = new(11, ReaderFileEntryState.Unavailable, 1, null, null, null, []);
        var owner = await Owner();
        await TestAssert.ThrowsAsync<CatalogFileEntryUnavailableException>(() => owner.ProcessAsync(page), "unknown liveness never advances durable deletion");
        await AssertUnchangedAsync(catalog, store, identity, before, "alias.png");
        await TestAssert.ThrowsAsync<InvalidOperationException>(() => owner.ProcessAsync(page), "failed metadata retires the page owner");
        reader.Overrides[11] = EntryCatalogReaderFixture.Names(new(5, "alias.png"), new(10, "blocked.png"));
        await SqlAsync(fixture.DatabasePath, "CREATE TRIGGER reject_entry BEFORE INSERT ON catalog_file_entries WHEN NEW.name='blocked.png' BEGIN SELECT RAISE(ABORT,'synthetic-entry-publication'); END;");
        owner = await Owner();
        await TestAssert.ThrowsAsync<SqliteException>(() => owner.ProcessAsync(page), "entry SQL failure rolls back the same node/checkpoint transaction");
        await AssertUnchangedAsync(catalog, store, identity, before, "alias.png");
        await SqlAsync(fixture.DatabasePath, "DROP TRIGGER reject_entry;");
        reader.Overrides[11] = EntryCatalogReaderFixture.Names(new(5, "alias.png"), new(99, "orphan.png"));
        owner = await Owner();
        await owner.ProcessAsync(page);
        TestAssert.Equal("alias.png", (await store.ReadAsync(identity))!.Entries.Single().Name, "missing alias parent preserves the whole old name set");
        TestAssert.Equal(1L, (await new CatalogFileEntryPending(catalog).ReadDueAsync(volume.VolumeId, 0)).Waiting, "missing parent becomes durable retry work");
        TestAssert.True((await catalog.ReadVolumeAsync(volume.VolumeId))!.CheckpointUsn > before.CheckpointUsn, "deferred entry does not block journal progress");
        before = (await catalog.ReadVolumeAsync(volume.VolumeId))!; page = DeletePage(before);
        reader.Overrides[11] = EntryCatalogReaderFixture.Names(new ReaderFileName(5, "alias.png"));
        using (var cancellation = new CancellationTokenSource()) {
            reader.CancelEntryRead = cancellation; owner = await Owner();
            await TestAssert.ThrowsAsync<OperationCanceledException>(() => owner.ProcessAsync(page, cancellation.Token), "cancellation between metadata and commit preserves the old page");
            reader.CancelEntryRead = null;
        }
        await AssertUnchangedAsync(catalog, store, identity, before, "alias.png");
        owner = await Owner(); await owner.ProcessAsync(page);
        TestAssert.Equal("alias.png", (await QueryAsync(catalog)).Single(item => item.Identity == identity).Name, "steady monitor FileDelete keeps the surviving alias");
        TestAssert.True(await facts.ReadCurrentAsync(identity, FileFactKind.ImageDimensions, 1) is not null, "steady monitor alias removal preserves current facts");
        before = (await catalog.ReadVolumeAsync(volume.VolumeId))!; page = DeletePage(before);
        reader.Overrides[11] = new(11, ReaderFileEntryState.Missing, 0, null, null, null, []);
        owner = await Owner(); await owner.ProcessAsync(page);
        TestAssert.False((await QueryAsync(catalog)).Any(item => item.Identity == identity), "last link removal hides the physical file");
        TestAssert.True(await store.ReadAsync(identity) is null, "last link removal clears replaceable names");
        TestAssert.True((await catalog.ReadVolumeAsync(volume.VolumeId))!.CheckpointUsn > before.CheckpointUsn, "successful deletion advances the matching checkpoint");
        await RecoveryAsync(catalog, reader, sync, volume.VolumeId, identity, fixture.DatabasePath);
        await SnapshotFailureAsync(catalog, reader, sync, volume.VolumeId, identity, fixture.DatabasePath);
        await LegacyGateAsync();
    }

    private static async Task SnapshotFailureAsync(CatalogV2Database catalog, EntryCatalogReaderFixture reader,
        CatalogSynchronizationService sync, string volume, CatalogEntryIdentity identity, string path)
    {
        var store = new CatalogFileEntryStore(catalog); var previous = (await store.ReadAsync(identity))!;
        reader.Overrides[11] = EntryCatalogReaderFixture.Names(new(10, "alpha.png"), new(5, "blocked-snapshot.png"));
        await SqlAsync(path, "CREATE TRIGGER reject_snapshot BEFORE INSERT ON catalog_file_entries WHEN NEW.name='blocked-snapshot.png' BEGIN SELECT RAISE(ABORT,'synthetic-snapshot-publication'); END;");
        await TestAssert.ThrowsAsync<SqliteException>(() => sync.SynchronizeAsync([volume], true), "snapshot entry failure rolls back physical rows and names together");
        TestAssert.True(previous.Entries.SequenceEqual((await store.ReadAsync(identity))!.Entries), "snapshot publication failure retains the preceding complete names");
        await SqlAsync(path, "DROP TRIGGER reject_snapshot;");
        reader.Overrides[11] = EntryCatalogReaderFixture.Names(new(10, "alpha.png"), new(5, "restored.png"));
        await sync.SynchronizeAsync([volume], false);
        reader.Overrides[11] = new(11, ReaderFileEntryState.Unavailable, 2, null, null, null, []);
        await sync.SynchronizeAsync([volume], true);
        TestAssert.True(previous.Entries.SequenceEqual((await store.ReadAsync(identity))!.Entries), "incomplete rebuild observation does not erase known complete names");
        TestAssert.Equal(2, (await QueryAsync(catalog)).Count(item => item.Identity == identity), "existing aliases remain available when a new observation is unknown");
    }

    private static async Task RecoveryAsync(CatalogV2Database catalog, EntryCatalogReaderFixture reader, CatalogSynchronizationService sync,
        string volume, CatalogEntryIdentity identity, string path)
    {
        reader.Base.Add("A:", new(11, 10, 1024, 132_000_000_000_000_011, 133_000_000_000_000_011, 32, false, "alpha.png", ".png"));
        reader.Overrides[11] = EntryCatalogReaderFixture.Names(new(10, "alpha.png"), new(5, "restored.png"));
        reader.Base.BreakJournal("A:"); reader.FailEntryRead = true;
        await TestAssert.ThrowsAsync<IOException>(() => sync.SynchronizeAsync([volume], false), "interrupted entry snapshot cannot publish its staged names");
        TestAssert.Equal("0", await SqlAsync(path, "SELECT COUNT(*) FROM catalog_file_entries WHERE file_reference='000000000000000B';"), "failed snapshot retains the preceding durable entry state");
        reader.FailEntryRead = false;
        await sync.SynchronizeAsync([volume], false);
        TestAssert.Equal(CatalogV2VolumeState.Ready, (await catalog.ReadVolumeAsync(volume))!.State, "interrupted build restarts through normal recovery");
        TestAssert.Equal(2, (await QueryAsync(catalog)).Count(item => item.Identity == identity), "discontinuity recovery republishes every alias");
        reader.Base.SetOnline("A:", false); await sync.SynchronizeAsync([volume], false);
        TestAssert.Equal(0, (await QueryAsync(catalog)).Count, "offline volume is not queryable");
        reader.Base.SetOnline("A:", true); await sync.SynchronizeAsync([volume], false);
        TestAssert.Equal(2, (await QueryAsync(catalog)).Count(item => item.Identity == identity), "online continuity recovery keeps aliases");
        var reopened = new CatalogV2Database(path); await reopened.InitializeAsync();
        TestAssert.Equal(2, (await QueryAsync(reopened)).Count(item => item.Identity == identity), "aliases survive database reopen");
    }

    private static async Task LegacyGateAsync()
    {
        using var fixture = new TemporaryCatalogFixture(); var catalog = new CatalogV2Database(fixture.DatabasePath); await catalog.InitializeAsync();
        var old = new SyntheticCatalogReader(); var sync = new CatalogSynchronizationService(catalog, old, captureFileEntries: true);
        var volumes = await sync.DiscoverAsync(); await catalog.SetVolumeSelectionAsync([volumes[0].VolumeId]);
        await TestAssert.ThrowsAsync<NotSupportedException>(() => sync.SynchronizeAsync([], false), "old Reader cannot start an entry-enabled build");
        TestAssert.Equal("0", await SqlAsync(fixture.DatabasePath, "SELECT COUNT(*) FROM sqlite_master WHERE name='catalog_file_entry_sets';"), "missing capability does not activate the extension");
        var reader = new EntryCatalogReaderFixture(); sync = new(catalog, reader);
        await sync.SynchronizeAsync([], false);
        TestAssert.Equal(0, reader.EntryReads, "default product path stays dormant until explicit activation");
    }

    private static CatalogReaderJournalPage DeletePage(CatalogV2VolumeSnapshot volume) => new(true,
        new(Convert.ToUInt64(volume.JournalId, 16), 0, 0, volume.CheckpointUsn!.Value + 1, true,
            [new(11, 5, 0x200, volume.CheckpointUsn.Value, 32, false, false, "alias.png", ".png", null, null, null)]));
    private static async Task<IReadOnlyList<CatalogV2QueryItem>> QueryAsync(CatalogV2Database catalog) =>
        (await catalog.QueryAsync(new("", [], CatalogQueryScope.AllVolumes(), null, CatalogEntryType.File, 100, null))).Items;
    private static async Task AssertUnchangedAsync(CatalogV2Database catalog, CatalogFileEntryStore store, CatalogEntryIdentity identity,
        CatalogV2VolumeSnapshot before, string name)
    {
        TestAssert.Equal(before.CheckpointUsn, (await catalog.ReadVolumeAsync(before.VolumeId))!.CheckpointUsn, "failed entry work preserves checkpoint");
        TestAssert.Equal(before.CatalogRevision, (await catalog.ReadVolumeAsync(before.VolumeId))!.CatalogRevision, "failed entry work preserves volume revision");
        TestAssert.Equal(name, (await store.ReadAsync(identity))!.Entries.Single().Name, "failed entry work preserves complete names");
        TestAssert.Equal(name, (await QueryAsync(catalog)).Single(item => item.Identity == identity).Name, "failed entry work preserves the physical query node");
    }
    private static async Task<string> SqlAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection($"Data Source={path};Pooling=False"); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql;
        return Convert.ToString(await command.ExecuteScalarAsync()) ?? "";
    }
}
