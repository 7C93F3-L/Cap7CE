using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host;
using Cap7CE.Core.Host.CatalogMaintenance;
using Cap7CE.Core.Reader.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogEntryRetryTests
{
    public static async Task RunAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        var catalog = new CatalogV2Database(fixture.DatabasePath); await catalog.InitializeAsync();
        var reader = new EntryCatalogReaderFixture();
        var sync = new CatalogSynchronizationService(catalog, reader, captureFileEntries: true);
        var volume = (await sync.DiscoverAsync()).First();
        await catalog.SetVolumeSelectionAsync([volume.VolumeId]); await sync.SynchronizeAsync([volume.VolumeId], false);
        var identity = new CatalogEntryIdentity(volume.VolumeId, "000000000000000B");
        var facts = new FileFactDatabase(fixture.DatabasePath); await facts.InitializeAsync();
        var source = (await facts.CaptureAsync(identity))!;
        await facts.PublishAsync(new(identity, source, FileFactKind.ImageDimensions, 1, FileFactState.Indexed, 640, 480));
        await using var session = await reader.ConnectAsync(CancellationToken.None);
        var native = (await session.ListVolumesAsync(CancellationToken.None)).Single(v => v.CatalogId == volume.VolumeId);
        var capture = new CatalogDirectoryEntryCapture(session, native, true);
        async Task DeferAsync(uint reason)
        {
            var current = (await catalog.ReadVolumeAsync(volume.VolumeId))!;
            var owner = await CatalogJournalPageOwner.CreateAsync(catalog, current, [], captureEntries: capture.CaptureJournalAsync);
            var page = new CatalogReaderJournalPage(true, new(Convert.ToUInt64(current.JournalId, 16), 0, 0,
                current.CheckpointUsn!.Value + 1, true, [new(11, 10, reason, current.CheckpointUsn.Value, 32, false, true, "alpha.png", ".png", 1024, 132_000_000_000_000_011, source.ModifiedFileTime)]));
            await owner.ProcessAsync(page);
        }
        reader.Overrides[11] = new(11, ReaderFileEntryState.Unavailable, 1, null, null, null, []);
        var before = (await catalog.ReadVolumeAsync(volume.VolumeId))!;
        await DeferAsync(0x200);
        TestAssert.Equal(before.CheckpointUsn + 1, (await catalog.ReadVolumeAsync(volume.VolumeId))!.CheckpointUsn, "unknown liveness is queued with its checkpoint");
        TestAssert.Equal("alpha.png", (await new CatalogFileEntryStore(catalog).ReadAsync(identity))!.Entries.Single().Name, "unknown metadata preserves known names");
        TestAssert.True(await facts.CaptureAsync(identity) is null, "uncertain identity cannot issue a content grant");
        TestAssert.True(await facts.ReadCurrentAsync(identity, FileFactKind.ImageDimensions, 1) is null, "uncertain facts are hidden");
        TestAssert.Equal(FileFactPublishResult.SourceChanged, await facts.PublishAsync(new(identity, source, FileFactKind.ImageDimensions, 1, FileFactState.Indexed, 1, 1)), "late worker cannot publish while pending");
        var pending = new CatalogFileEntryPending(new(fixture.DatabasePath));
        TestAssert.Equal(1, (await pending.ReadDueAsync(volume.VolumeId, 0)).Items.Count, "pending survives reopen");
        var clock = new Clock(); var retry = new CatalogDirectoryEntryRetryOwner(catalog, session, native, clock);
        var revision = await catalog.ReadRevisionAsync();
        await retry.StepAsync(); var reads = reader.EntryReads;
        TestAssert.Equal(revision, await catalog.ReadRevisionAsync(), "backoff-only writes do not invalidate query cursors");
        await retry.StepAsync();
        TestAssert.Equal(reads, reader.EntryReads, "cached deadline prevents repeated reads");
        for (var attempt = 1; attempt < 8; attempt++) { clock.Now = retry.NextDue; await retry.StepAsync(); }
        var blocked = await pending.ReadDueAsync(volume.VolumeId, clock.Now);
        TestAssert.Equal(1L, blocked.Blocked, "eight unavailable reads reach a durable bound");
        TestAssert.Equal(long.MaxValue, retry.NextDue, "all blocked work is silent");
        reader.Overrides[11] = EntryCatalogReaderFixture.Names(new ReaderFileName(5, "surviving.png"));
        await pending.RearmAsync(volume.VolumeId); retry.NotifyJournalChange();
        await retry.StepAsync();
        TestAssert.Equal(0L, (await pending.ReadDueAsync(volume.VolumeId, clock.Now)).Waiting, "explicit rearm resolves the persisted item");
        TestAssert.True(await facts.ReadCurrentAsync(identity, FileFactKind.ImageDimensions, 1) is not null, "deleting one name reuses physical facts after successful retry");
        // A later unreadable content event must retain its invalidation across restart/retry.
        reader.Overrides[11] = new(11, ReaderFileEntryState.Unavailable, 1, null, null, null, []);
        await DeferAsync(1);
        reader.Overrides[11] = EntryCatalogReaderFixture.Names(new ReaderFileName(5, "surviving.png"));
        retry = new(catalog, session, native, clock); await retry.StepAsync();
        TestAssert.True(await facts.ReadCurrentAsync(identity, FileFactKind.ImageDimensions, 1) is null, "delayed content event invalidates old facts even if size and timestamp match");
        TestAssert.True((await facts.CaptureAsync(identity))!.ContentRevision > source.ContentRevision, "content revision is advanced exactly on confirmed publication");
        // SQL failure and cancellation leave the old pending item and checkpoint intact.
        reader.Overrides[11] = new(11, ReaderFileEntryState.Unavailable, 1, null, null, null, []); await DeferAsync(1);
        reader.Overrides[11] = EntryCatalogReaderFixture.Names(new ReaderFileName(5, "rejected.png"));
        await SqlAsync(fixture.DatabasePath, "CREATE TRIGGER reject_retry BEFORE INSERT ON catalog_file_entries WHEN NEW.name='rejected.png' BEGIN SELECT RAISE(ABORT,'retry'); END;");
        retry = new(catalog, session, native, clock); revision = await catalog.ReadRevisionAsync();
        await TestAssert.ThrowsAsync<SqliteException>(() => retry.StepAsync(), "failed retry rolls back pending deletion with entries");
        TestAssert.Equal(revision, await catalog.ReadRevisionAsync(), "failed retry preserves revision");
        TestAssert.Equal(1, (await pending.ReadDueAsync(volume.VolumeId, clock.Now)).Items.Count, "failed retry keeps durable work");
        await SqlAsync(fixture.DatabasePath, "DROP TRIGGER reject_retry;");
        using var cancellation = new CancellationTokenSource(); reader.CancelEntryRead = cancellation;
        retry = new(catalog, session, native, clock);
        await TestAssert.ThrowsAsync<OperationCanceledException>(() => retry.StepAsync(cancellation.Token), "cancelled retry does not publish partial state");
        reader.CancelEntryRead = null;
        TestAssert.Equal(revision, await catalog.ReadRevisionAsync(), "cancelled retry preserves revision");
        // One missing parent in a page must not hold every other identity back.
        var currentVolume = (await catalog.ReadVolumeAsync(volume.VolumeId))!;
        var orphan = new CatalogV2NodeRecord(new(volume.VolumeId, "000000000000FEED"), "0000000000000063", "orphan.png", ".png", false, 32, true, 1024, 1, 2);
        await catalog.ApplyMaintenanceBatchAsync(new(volume.VolumeId, currentVolume.JournalId, currentVolume.CheckpointUsn,
            revision, currentVolume.CheckpointUsn!.Value + 1, currentVolume.JournalFirstUsn, currentVolume.JournalLowestValidUsn,
            [], [], [new(orphan, 1)]));
        reader.Overrides[0xFEED] = new(0xFEED, ReaderFileEntryState.Complete, 1, 1024, 1, 2, [new(99, "orphan.png")]);
        retry = new(catalog, session, native, clock); await retry.StepAsync();
        TestAssert.Equal("rejected.png", (await new CatalogFileEntryStore(catalog).ReadAsync(identity))!.Entries.Single().Name, "healthy identity resolves despite a different missing parent");
        var unresolved = await pending.ReadDueAsync(volume.VolumeId, clock.Now);
        TestAssert.Equal(1L, unresolved.Waiting, "only the unresolved parent is deferred");
        TestAssert.True(unresolved.NextRetryAt > clock.Now, "unresolved parent uses bounded backoff");
        reader.Overrides[0xFEED] = new(0xFEED, ReaderFileEntryState.Missing, 0, null, null, null, []);
        await pending.RearmAsync(volume.VolumeId);
        reader.Overrides[11] = new(11, ReaderFileEntryState.Unavailable, 1, null, null, null, []); await DeferAsync(1);
        reader.Overrides[11] = new(11, ReaderFileEntryState.Missing, 0, null, null, null, []);
        retry = new(catalog, session, native, clock); await retry.StepAsync();
        TestAssert.True(await new CatalogFileEntryStore(catalog).ReadAsync(identity) is null, "confirmed missing clears final names");
        TestAssert.Equal(0L, (await pending.ReadDueAsync(volume.VolumeId, clock.Now)).Waiting, "confirmed missing clears pending work");
    }
    private static async Task SqlAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection($"Data Source={path};Pooling=False"); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; await command.ExecuteNonQueryAsync();
    }
    private sealed class Clock : TimeProvider
    {
        public long Now { get; set; } = 1000;
        public override DateTimeOffset GetUtcNow() => DateTimeOffset.FromUnixTimeMilliseconds(Now);
    }
}
