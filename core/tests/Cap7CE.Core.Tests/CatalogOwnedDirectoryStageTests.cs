using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Catalog.Queries;
using Cap7CE.Core.Host;
using Cap7CE.Core.Host.CatalogMaintenance;
using Cap7CE.Core.Reader.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogOwnedDirectoryStageTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-owned-stage-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); var path = Path.Combine(root, "fixture.db");
        static ReaderJournalRecordV2 Record(ulong id, ulong parent, bool directory, long usn) =>
            new(id, parent, 0x100, usn, directory ? 16u : 32u, directory, true, "node-" + id, directory ? "" : ".csv", 100, 1, 1);
        try {
            var catalog = new CatalogV2Database(path); await catalog.InitializeAsync();
            await catalog.RegisterVolumeAsync("v", "X:", "NTFS", true);
            await catalog.BeginBuildAsync("v", "42", 100, 0, 0, 1, false);
            var ownedRoot = new CatalogV2NodeRecord(new("v", "0000000000000001"), null, "owned", "", true, 16, true, null, 1, 1);
            await catalog.ApplyBatchAsync(new("v", "42", 100, await catalog.ReadRevisionAsync(), 100, 0, 0, [ownedRoot]));
            await catalog.CompleteSynchronizationAsync("v"); await new FileFactDatabase(path).InitializeAsync();
            var stage = new CatalogOwnedDirectoryStage(); stage.Retain([Record(2, 1, true, 100)]);
            stage.Retain([Record(2, 1, true, 101) with { Name = "renamed" }, Record(3, 2, true, 102)]);
            TestAssert.Equal(2, stage.Count, "own-only pages keep bounded latest directory ancestry in memory");
            TestAssert.Equal(1L, await Scalar(path, "SELECT COUNT(*) FROM catalog_nodes_v2;"), "own-only staging does not write Catalog");
            var publication = stage.Prepare("v", [Record(4, 1, false, 103), Record(4, 1, false, 104) with { Reason = 0x80000000 }]);
            TestAssert.Equal(3, publication.Nodes.Count, "external publication includes latest staged ancestry and de-duplicates external events");
            TestAssert.True(publication.Nodes.Single(node => !node.IsDirectory).InvalidatesFileFacts, "later close event cannot erase earlier content invalidation");
            var revision = await catalog.ReadRevisionAsync();
            var batch = new CatalogV2WriteBatch("v", "42", 100, revision, 105, 0, 0, publication.Nodes);
            await Execute(path, "CREATE TRIGGER reject_own_checkpoint BEFORE UPDATE ON catalog_volumes_v2 WHEN NEW.checkpoint_usn<>OLD.checkpoint_usn BEGIN SELECT RAISE(ABORT,'fixture'); END;");
            await TestAssert.ThrowsAsync<SqliteException>(() => catalog.ApplyMaintenanceBatchAsync(batch), "failed checkpoint rolls back staged ancestry and external facts together");
            TestAssert.Equal(2, stage.Count, "failed commit leaves staged ancestry for replay");
            TestAssert.Equal(1L, await Scalar(path, "SELECT COUNT(*) FROM catalog_nodes_v2;"), "failed publication cannot publish directories alone");
            TestAssert.Equal(0, (await new FileFactChangeLog(path).ReadPageAsync()).Count, "failed transaction leaves no discovery hints");
            await Execute(path, "DROP TRIGGER reject_own_checkpoint;");
            var committed = await catalog.ApplyMaintenanceBatchAsync(batch); stage.Complete(publication);
            TestAssert.Equal(CatalogV2VolumeState.Ready, committed.State, "incremental publication remains queryable without extra readiness writes");
            TestAssert.Equal(105L, committed.CheckpointUsn!.Value, "checkpoint includes ignored own prefix atomically");
            TestAssert.Equal(0, stage.Count, "only successful publication clears owner memory");
            var reopened = new CatalogV2Database(path);
            var ancestry = await new CatalogStorageDirectoryReader(reopened).ReadOwnedPageAsync("v", [ownedRoot.Identity.FileReference], await reopened.ReadRevisionAsync());
            TestAssert.Equal(3, ancestry.Directories.Count, "restarted owner can classify nested own directories after checkpoint advances");
            TestAssert.Equal("renamed", (string)(await Value(path, "SELECT name FROM catalog_nodes_v2 WHERE file_reference='0000000000000002';"))!, "latest owned rename is persisted");
            var hints = await new FileFactChangeLog(path).ReadPageAsync();
            TestAssert.Equal(1, hints.Count, "owned directory publication does not trigger redundant subtree extraction");
            TestAssert.Equal("0000000000000004", hints[0].Identity.FileReference, "external hint survives own storage publication");
            await TestAssert.ThrowsAsync<CatalogConcurrencyException>(() => reopened.ApplyMaintenanceBatchAsync(batch), "replayed old checkpoint cannot publish twice");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.ApplyMaintenanceBatchAsync(batch with { Nodes = [publication.Nodes.First(node => node.IsDirectory)] }), "own-only durable writes explicitly refused");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.ApplyMaintenanceBatchAsync(batch with { Nodes = [publication.Nodes.Single(node => !node.IsDirectory) with { SuppressFileFactChangeHint = true }] }), "file event may never use directory-only hint suppression");
            var currentRevision = await catalog.ReadRevisionAsync();
            await TestAssert.ThrowsAsync<CatalogStateTransitionException>(() => catalog.ApplyBatchAsync(batch with { ExpectedCheckpointUsn = 105, ExpectedCatalogRevision = currentRevision }), "legacy batch API still rejects ready-state writes");
            stage.Retain([Record(5, 1, true, 106)]); var old = stage.Prepare("v", [Record(6, 0, false, 107)]);
            stage.Retain([Record(7, 1, true, 108)]);
            await TestAssert.ThrowsAsync<InvalidOperationException>(() => Task.Run(() => stage.Complete(old)), "stale publication cannot discard later ancestry");
            var movedIn = stage.Prepare("v", [Record(5, 0, true, 105)]);
            TestAssert.False(movedIn.Nodes.Single(node => node.Identity.FileReference == "0000000000000005").SuppressFileFactChangeHint, "formerly external directory retains change hint even when newer owned record wins");
            var full = new CatalogOwnedDirectoryStage(); full.Retain(Enumerable.Range(1, 4096).Select(id => Record((ulong)id, 1, true, id)).ToArray());
            await TestAssert.ThrowsAsync<CatalogReaderDiscontinuityException>(() => Task.Run(() => full.Retain([Record(5000, 1, true, 5000)])), "capacity overflow requires completeness recovery instead of self-write");
            TestAssert.Equal(4096, full.Count, "overflow rejection preserves earlier pending ancestry");
            TestAssert.True(await catalog.CheckIntegrityAsync(), "staged publication integrity");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
    private static async Task Execute(string path, string sql) {
        await using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; await command.ExecuteNonQueryAsync();
    }
    private static async Task<object?> Value(string path, string sql) {
        await using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; return await command.ExecuteScalarAsync();
    }
    private static async Task<long> Scalar(string path, string sql) => Convert.ToInt64(await Value(path, sql));
}
