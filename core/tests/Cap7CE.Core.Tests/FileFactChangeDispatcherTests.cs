using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactChangeDispatcherTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-change-dispatch-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); var path = Path.Combine(root, "fixture.db");
        FileFactQueuePolicy policy = new(["a", "b"], [new("a"), new("b")], []);
        FileFactChangeSpecification[] specifications = [new(FileFactKind.ImageDimensions, 2, [".png"]),
            new(FileFactKind.TextData, 2, [".csv"])];
        try {
            var dormantPath = Path.Combine(root, "never-created.db");
            var dormant = new FileFactChangeDispatcher(dormantPath, policy with { Includes = [] }, specifications);
            TestAssert.False((await dormant.StepAsync()).HasMore, "empty grant stays dormant");
            TestAssert.False(File.Exists(dormantPath), "dormant dispatcher cannot create a database");
            await new CatalogV2Database(path).InitializeAsync();
            var queue = new FileFactQueue(path); await queue.InitializeAsync(); await queue.SetPolicyAsync(policy);
            await ExecuteAsync(path, """
                INSERT INTO catalog_volumes_v2 VALUES('a','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                INSERT INTO catalog_volumes_v2 VALUES('b','Y:','NTFS',1,NULL,NULL,NULL,NULL,'offline',0,NULL,0);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000001',NULL,'root','',1,16,1,0,1,1);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000002','0000000000000001','nested','',1,16,1,0,1,1);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000011','0000000000000002','one.png','.png',0,32,1,100,1,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000012','0000000000000002','two.png','.png',0,32,1,100,1,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000013','0000000000000002','data.csv','.csv',0,32,1,100,1,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000014','0000000000000001','unrelated.png','.png',0,32,1,100,1,133000000000000003);
                INSERT INTO file_fact_catalog_changes(volume_id,file_reference,scan_descendants) VALUES('a','0000000000000002',1);
                """);
            var dispatcher = new FileFactChangeDispatcher(path, policy, specifications);
            var first = await dispatcher.StepAsync(1);
            TestAssert.Equal(1, first.JobsDiscovered, "subtree work is page bounded");
            TestAssert.False(first.Acknowledged, "first page cannot acknowledge unfinished providers");
            TestAssert.Equal(1L, await CountAsync(path, "file_fact_catalog_changes"), "unfinished hint survives process loss");
            dispatcher = new(path, policy, specifications); // crash/reopen, replay already enqueued page
            for (var index = 0; index < 8 && (await dispatcher.StepAsync(1)).HasMore; index++) { }
            TestAssert.Equal(3L, await CountAsync(path, "file_fact_jobs"), "replay deduplicates and enqueues all providers but no unrelated file");
            TestAssert.Equal(0L, await CountAsync(path, "file_fact_catalog_changes"), "hint acknowledged only after all provider pages");
            await ExecuteAsync(path, """
                DELETE FROM file_fact_jobs;
                INSERT INTO file_fact_catalog_changes(volume_id,file_reference,scan_descendants) VALUES
                    ('b','0000000000000021',0),('b','0000000000000022',0),('b','0000000000000023',0),('a','0000000000000014',0);
                """);
            dispatcher = new(path, policy, specifications);
            for (var index = 0; index < 10 && (await dispatcher.StepAsync(2)).HasMore; index++) { }
            TestAssert.Equal(1L, await CountAsync(path, "file_fact_jobs"), "older offline hints cannot starve a later ready drive");
            TestAssert.Equal(3L, await CountAsync(path, "file_fact_catalog_changes"), "offline hints remain durable");
            await ExecuteAsync(path, """
                DELETE FROM file_fact_catalog_changes; DELETE FROM file_fact_jobs;
                INSERT INTO file_fact_catalog_changes(volume_id,file_reference,scan_descendants) VALUES('a','0000000000000002',1);
                CREATE TRIGGER move_catalog_during_enqueue AFTER INSERT ON file_fact_jobs BEGIN
                    UPDATE catalog_state_v2 SET catalog_revision=catalog_revision+1;
                    UPDATE catalog_volumes_v2 SET catalog_revision=catalog_revision+1 WHERE volume_id='a';
                END;
                """);
            dispatcher = new(path, policy, [specifications[0]]);
            TestAssert.False((await dispatcher.StepAsync()).Acknowledged, "Catalog changes between discovery and acknowledgment retain the hint");
            await ExecuteAsync(path, "DROP TRIGGER move_catalog_during_enqueue;");
            TestAssert.True((await dispatcher.StepAsync()).Acknowledged, "retained hint safely replays after stable Catalog");
            await ExecuteAsync(path, """
                DELETE FROM file_fact_jobs;
                INSERT INTO file_fact_catalog_changes(volume_id,file_reference,scan_descendants) VALUES('a','0000000000000002',1);
                """);
            dispatcher = new(path, policy, specifications);
            await dispatcher.StepAsync(1);
            await ExecuteAsync(path, "UPDATE file_fact_catalog_changes SET sequence=sequence+100;");
            await dispatcher.StepAsync(1); var stale = await dispatcher.StepAsync(1);
            TestAssert.False(stale.Acknowledged, "older dispatcher acknowledgment cannot erase a new generation");
            TestAssert.Equal(1L, await CountAsync(path, "file_fact_catalog_changes"), "new generation remains for replay");
            using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
            await TestAssert.ThrowsAsync<OperationCanceledException>(() => dispatcher.StepAsync(token: cancelled.Token), "cancel does not acknowledge a hint");
            await ExecuteAsync(path, "DELETE FROM file_fact_jobs;");
            dispatcher = new(path, policy with { Excludes = [new("a", "0000000000000002")] }, specifications);
            await dispatcher.StepAsync(); TestAssert.True((await dispatcher.StepAsync()).Acknowledged, "excluded subtree may retire its hint");
            TestAssert.Equal(0L, await CountAsync(path, "file_fact_jobs"), "current exclusion never enqueues sources");
            await ExecuteAsync(path, """
                DELETE FROM file_fact_catalog_changes;
                WITH RECURSIVE hints(x) AS(SELECT 1 UNION ALL SELECT x+1 FROM hints WHERE x<200)
                INSERT INTO file_fact_catalog_changes(volume_id,file_reference,scan_descendants)
                    SELECT 'outside',printf('%016X',x),0 FROM hints;
                INSERT INTO file_fact_catalog_changes(volume_id,file_reference,scan_descendants) VALUES
                    ('b','0000000000000021',0),('b','0000000000000022',0),('b','0000000000000023',0),('a','0000000000000014',0);
                """);
            dispatcher = new(path, policy, specifications);
            var skipped = await dispatcher.StepAsync(128);
            TestAssert.True(skipped.Acknowledged && skipped.HasMore, "unselected hints retire in one bounded page");
            TestAssert.Equal(76L, await CountAsync(path, "file_fact_catalog_changes"), "one step skips 128 hints, not one");
            for (var index = 0; index < 6 && (await dispatcher.StepAsync(128)).HasMore; index++) { }
            TestAssert.Equal(3L, await CountAsync(path, "file_fact_catalog_changes"), "batched skip preserves offline hints");
            TestAssert.Equal(1L, await CountAsync(path, "file_fact_jobs"), "batched skip cannot starve later authorized work");
            await ExecuteAsync(path, """
                DELETE FROM file_fact_catalog_changes; DELETE FROM file_fact_jobs;
                INSERT INTO file_fact_catalog_changes(volume_id,file_reference,scan_descendants) VALUES('a','0000000000000002',1);
                """);
            dispatcher = new(path, policy, specifications);
            var finished = false;
            for (var index = 0; index < 12 && !finished; index++) {
                await ExecuteAsync(path, """
                    UPDATE catalog_state_v2 SET catalog_revision=catalog_revision+1;
                    UPDATE catalog_volumes_v2 SET catalog_revision=catalog_revision+1 WHERE volume_id='b';
                    """);
                finished = (await dispatcher.StepAsync(1)).Acknowledged;
            }
            TestAssert.True(finished, "continuous other-volume changes cannot restart the related cursor");
            TestAssert.Equal(3L, await CountAsync(path, "file_fact_jobs"), "related providers finish despite other-volume noise");
            TestAssert.Equal(0L, await CountAsync(path, "file_fact_catalog_changes"), "volume-specific fence safely retires the hint");
            TestAssert.True(await new CatalogV2Database(path).CheckIntegrityAsync(), "dispatcher preserves database integrity");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
    private static async Task ExecuteAsync(string path, string sql) {
        await using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; await command.ExecuteNonQueryAsync();
    }
    private static async Task<long> CountAsync(string path, string table) {
        await using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = "SELECT COUNT(*) FROM " + table;
        return Convert.ToInt64(await command.ExecuteScalarAsync());
    }
}
