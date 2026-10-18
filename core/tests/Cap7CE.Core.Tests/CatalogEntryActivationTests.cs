using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host;
using Cap7CE.Core.Host.CatalogMaintenance;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogEntryActivationTests
{
    public static async Task RunAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        var catalog = new CatalogV2Database(fixture.DatabasePath); await catalog.InitializeAsync();
        var reader = new EntryCatalogReaderFixture(); var legacy = new CatalogSynchronizationService(catalog, reader);
        var volume = (await legacy.DiscoverAsync()).First(); await catalog.SetVolumeSelectionAsync([volume.VolumeId]);
        await legacy.SynchronizeAsync([volume.VolumeId], false);
        var activation = new CatalogFileEntryActivation(catalog);
        TestAssert.False(await activation.ReadEnabledAsync(), "normal initialization and queries do not activate storage");
        var identity = new CatalogEntryIdentity(volume.VolumeId, "000000000000000B");
        var facts = new FileFactDatabase(fixture.DatabasePath); await facts.InitializeAsync();
        var source = (await facts.CaptureAsync(identity))!;
        await facts.PublishAsync(new(identity, source, FileFactKind.ImageDimensions, 1, FileFactState.Indexed, 640, 480));
        var queue = new FileFactQueue(fixture.DatabasePath); await queue.InitializeAsync();
        var policy = new FileFactQueuePolicy([volume.VolumeId], [new(volume.VolumeId, null)], []);
        await queue.SetPolicyAsync(policy); await queue.EnqueueAsync([new(identity, FileFactKind.ImageDimensions, 2)]);
        var lease = (await queue.ClaimAsync())!;
        var revision = await catalog.ReadRevisionAsync();
        await TestAssert.ThrowsAsync<CatalogConcurrencyException>(() => activation.EnablePreparedAsync(revision - 1), "stale recovery checkpoint cannot activate");
        TestAssert.Equal("0", await SqlAsync(fixture.DatabasePath, "SELECT COUNT(*) FROM sqlite_master WHERE name GLOB 'catalog_file_entry_*';"), "stale activation creates no partial extension");
        await SqlAsync(fixture.DatabasePath, "UPDATE catalog_volumes_v2 SET state='catchingUp' WHERE selected=1;");
        await TestAssert.ThrowsAsync<CatalogStateTransitionException>(() => activation.EnablePreparedAsync(revision), "running synchronization must retire first");
        await SqlAsync(fixture.DatabasePath, "UPDATE catalog_volumes_v2 SET state='ready' WHERE selected=1;");
        await SqlAsync(fixture.DatabasePath, "CREATE TRIGGER reject_activation BEFORE UPDATE ON catalog_volumes_v2 BEGIN SELECT RAISE(ABORT,'activation'); END;");
        await TestAssert.ThrowsAsync<SqliteException>(() => activation.EnablePreparedAsync(revision), "activation DDL and state/version publish atomically");
        TestAssert.Equal("2", await SqlAsync(fixture.DatabasePath, "PRAGMA user_version;"), "failed activation preserves old storage version");
        TestAssert.Equal("0", await SqlAsync(fixture.DatabasePath, "SELECT COUNT(*) FROM sqlite_master WHERE name GLOB 'catalog_file_entry_*';"), "failed activation rolls back every extension table");
        TestAssert.True(await facts.ReadCurrentAsync(identity, FileFactKind.ImageDimensions, 1) is not null, "failed activation preserves old facts");
        await SqlAsync(fixture.DatabasePath, "DROP TRIGGER reject_activation;");
        using (var stopped = new CancellationTokenSource()) {
            stopped.Cancel(); await TestAssert.ThrowsAsync<OperationCanceledException>(() => activation.EnablePreparedAsync(revision, stopped.Token), "cancelled activation publishes nothing");
        }
        TestAssert.True(await activation.EnablePreparedAsync(revision), "explicit prepared activation succeeds");
        TestAssert.Equal("3", await SqlAsync(fixture.DatabasePath, "PRAGMA user_version;"), "storage version fences old binaries");
        TestAssert.True(await activation.ReadEnabledAsync(), "entry mode survives a separate connection");
        TestAssert.True((await catalog.ReadVolumesAsync()).All(v => v.State == CatalogV2VolumeState.NeedsRebuild), "selected and unselected legacy volumes require complete entry snapshots");
        var enabledRevision = await catalog.ReadRevisionAsync();
        TestAssert.False(await activation.EnablePreparedAsync(revision), "activation is idempotent after publication");
        TestAssert.Equal(enabledRevision, await catalog.ReadRevisionAsync(), "repeated activation does not change revision");
        // Simulate a ready snapshot with basic metadata but no complete names.
        await SqlAsync(fixture.DatabasePath, "UPDATE catalog_volumes_v2 SET state='ready' WHERE selected=1;");
        TestAssert.True(await facts.CaptureAsync(identity) is null, "active mode cannot issue grants for unobserved names");
        TestAssert.False(await queue.RenewAsync(lease.LeaseId), "an existing physical lease cannot bypass unknown entry coverage");
        TestAssert.Equal(0, (await new FileFactDiscovery(fixture.DatabasePath).ReadPageAsync(policy, FileFactKind.ImageDimensions, 2, [".png"])).Jobs.Count, "unknown names are not discovered for content extraction");
        TestAssert.True(await new FileFactSourceResolver(fixture.DatabasePath).ResolveAsync(identity) is null, "unknown names cannot resolve an implicit canonical content path");
        await TestAssert.ThrowsAsync<CatalogSchemaException>(() => legacy.SynchronizeAsync([volume.VolumeId], false), "legacy synchronization is rejected before changing readiness");
        TestAssert.Equal(CatalogV2VolumeState.Ready, (await catalog.ReadVolumeAsync(volume.VolumeId))!.State, "rejected writer leaves readiness intact");
        var current = (await catalog.ReadVolumeAsync(volume.VolumeId))!;
        await TestAssert.ThrowsAsync<CatalogSchemaException>(() => CatalogJournalPageOwner.CreateAsync(catalog, current, []), "legacy monitor owner cannot attach to active storage");
        await TestAssert.ThrowsAsync<CatalogSchemaException>(() => catalog.BeginSnapshotBuildAsync(volume.VolumeId, current.JournalId!, current.CheckpointUsn!.Value, 0, 0, null, false), "legacy builder cannot mark an active volume building");
        var node = new CatalogV2NodeRecord(identity, "000000000000000A", "alpha.png", ".png", false, 32, true, 1024, 1, 2);
        await TestAssert.ThrowsAsync<CatalogSchemaException>(() => catalog.ApplyMaintenanceBatchAsync(new(volume.VolumeId, current.JournalId, current.CheckpointUsn,
            enabledRevision, current.CheckpointUsn!.Value + 1, 0, 0, [node])), "legacy node/checkpoint publication is rejected in the transaction");
        TestAssert.Equal(enabledRevision, await catalog.ReadRevisionAsync(), "rejected publication preserves revision");
        var aware = new CatalogSynchronizationService(catalog, reader, captureFileEntries: true);
        await aware.SynchronizeAsync([volume.VolumeId], true);
        TestAssert.True(await facts.CaptureAsync(identity) is not null, "verified complete names restore source eligibility");
        TestAssert.True((await new FileFactDiscovery(fixture.DatabasePath).ReadPageAsync(policy, FileFactKind.ImageDimensions, 2, [".png"])).Jobs.Any(job => job.Identity == identity), "verified names re-enter discovery");
        var reopened = new CatalogV2Database(fixture.DatabasePath); await reopened.InitializeAsync();
        TestAssert.True(await new CatalogFileEntryActivation(reopened).ReadEnabledAsync(), "reopen retains the storage mode without activation writes");
        await SqlAsync(fixture.DatabasePath, "UPDATE catalog_file_entry_activation SET feature_version=2;");
        await TestAssert.ThrowsAsync<CatalogSchemaException>(() => reopened.InitializeAsync(), "future entry feature version is not silently downgraded");
        await SqlAsync(fixture.DatabasePath, "UPDATE catalog_file_entry_activation SET feature_version=1; PRAGMA user_version=2;");
        await TestAssert.ThrowsAsync<CatalogSchemaException>(() => reopened.InitializeAsync(), "editing the storage header is not a rollback");
        await SqlAsync(fixture.DatabasePath, "PRAGMA user_version=3;");
        TestAssert.True(await catalog.CheckIntegrityAsync(), "activation guards preserve SQLite integrity");
        var missingPath = Path.Combine(Path.GetDirectoryName(fixture.DatabasePath)!, "missing-entry-activation.db");
        await TestAssert.ThrowsAsync<SqliteException>(() => new CatalogFileEntryActivation(new(missingPath)).EnablePreparedAsync(0), "activation never creates a missing source");
        TestAssert.False(File.Exists(missingPath), "missing source stays absent");
    }
    private static async Task<string> SqlAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection($"Data Source={path};Pooling=False"); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; return Convert.ToString(await command.ExecuteScalarAsync()) ?? "";
    }
}
