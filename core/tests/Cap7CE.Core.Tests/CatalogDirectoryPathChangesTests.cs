using Cap7CE.Core.Catalog;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogDirectoryPathChangesTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-path-changes-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); var path = Path.Combine(root, "catalog.db");
        try
        {
            var database = new CatalogV2Database(path); await database.InitializeAsync();
            await ScalarAsync(path, """
                INSERT INTO catalog_volumes_v2 VALUES('fixture','X:','NTFS',1,'0000000000000001',1,0,0,'ready',4,4,0);
                INSERT INTO catalog_nodes_v2 VALUES
                    ('fixture','0000000000000001',NULL,'.','',1,16,1,0,1,1),
                    ('fixture','0000000000000002','0000000000000001','folder','',1,16,1,0,1,1),
                    ('fixture','0000000000000004','0000000000000002','nested','',1,16,1,0,1,1),
                    ('fixture','0000000000000003','0000000000000004','sample.png','.png',0,32,1,10,1,1);
                INSERT INTO catalog_directory_paths_v2 VALUES
                    ('fixture','0000000000000001',''),('fixture','0000000000000002','folder'),
                    ('fixture','0000000000000004','folder\nested');
                CREATE TABLE path_delete_audit(total INTEGER NOT NULL);
                INSERT INTO path_delete_audit VALUES(0);
                CREATE TRIGGER audit_path_delete AFTER DELETE ON catalog_directory_paths_v2 BEGIN
                    UPDATE path_delete_audit SET total=total+1;
                END;
                """);
            CatalogV2NodeRecord Directory(int id, int parent, string name, bool exists = true) =>
                new(new("fixture", id.ToString("X16")), parent.ToString("X16"), name, "", true, 16, exists, 0, 1, 2);
            async Task Apply(params CatalogV2NodeRecord[] nodes)
            {
                var volume = (await database.ReadVolumeAsync("fixture"))!;
                await database.ApplyMaintenanceBatchAsync(new("fixture", volume.JournalId, volume.CheckpointUsn,
                    await database.ReadRevisionAsync(), volume.CheckpointUsn!.Value + 1, 0, 0, nodes));
            }
            async Task<long> Deleted() => Convert.ToInt64(await ScalarAsync(path, "SELECT total FROM path_delete_audit;"));
            await Apply(Directory(2, 1, "folder"));
            TestAssert.Equal(0L, await Deleted(), "directory time changes must not rewrite volume paths");
            TestAssert.Equal(2L, Convert.ToInt64(await ScalarAsync(path,
                "SELECT modified_utc_ticks FROM catalog_nodes_v2 WHERE file_reference='0000000000000002';")),
                "skipping path work still commits basic metadata");
            await Apply(Directory(2, 1, "renamed"));
            TestAssert.Equal(3L, await Deleted(), "rename retains the existing structural rebuild");
            TestAssert.Equal("renamed\\nested", (string)(await ScalarAsync(path,
                "SELECT relative_path FROM catalog_directory_paths_v2 WHERE file_reference='0000000000000004';"))!,
                "ancestor rename updates descendant paths");
            await Apply(Directory(4, 1, "nested"));
            TestAssert.Equal("nested", (string)(await ScalarAsync(path,
                "SELECT relative_path FROM catalog_directory_paths_v2 WHERE file_reference='0000000000000004';"))!,
                "directory move updates paths");
            TestAssert.Equal(3L, await Deleted(), "moving a leaf must not delete unrelated paths");
            await Apply(Directory(4, 1, "leaf-renamed"));
            TestAssert.Equal("leaf-renamed", (string)(await ScalarAsync(path,
                "SELECT relative_path FROM catalog_directory_paths_v2 WHERE file_reference='0000000000000004';"))!,
                "leaf rename updates its materialized path even when it contains files");
            TestAssert.Equal(3L, await Deleted(), "leaf rename retains unrelated paths");
            await Apply(Directory(5, 2, "new"));
            TestAssert.Equal(4L, Convert.ToInt64(await ScalarAsync(path, "SELECT count(*) FROM catalog_directory_paths_v2;")),
                "new directories are materialized");
            TestAssert.Equal(3L, await Deleted(), "new leaf does not rebuild existing paths");
            await Apply(Directory(5, 2, "new", false));
            TestAssert.Equal(3L, Convert.ToInt64(await ScalarAsync(path, "SELECT count(*) FROM catalog_directory_paths_v2;")),
                "deleted directories leave no path entry");
            TestAssert.Equal(4L, await Deleted(), "leaf deletion removes exactly its own path");
            await ScalarAsync(path, """
                CREATE TRIGGER reject_leaf_path BEFORE INSERT ON catalog_directory_paths_v2
                WHEN NEW.file_reference='0000000000000006' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END;
                """);
            var before = (await database.ReadVolumeAsync("fixture"))!;
            var revision = await database.ReadRevisionAsync();
            try { await Apply(Directory(6, 2, "rejected")); throw new Exception("path write failure accepted"); }
            catch (SqliteException) { }
            TestAssert.Equal(before, (await database.ReadVolumeAsync("fixture"))!, "failed leaf update rolls back checkpoint and volume");
            TestAssert.Equal(revision, await database.ReadRevisionAsync(), "failed leaf update rolls back revision");
            TestAssert.Equal(0L, Convert.ToInt64(await ScalarAsync(path,
                "SELECT count(*) FROM catalog_nodes_v2 WHERE file_reference='0000000000000006';")), "failed leaf update rolls back node");
            await ScalarAsync(path, "DROP TRIGGER reject_leaf_path;");
            // Parent and child changes in the same publication retain the full resolver.
            var current = (await database.ReadVolumeAsync("fixture"))!;
            var deleted = await Deleted();
            await database.ApplyMaintenanceBatchAsync(new("fixture", current.JournalId, current.CheckpointUsn,
                await database.ReadRevisionAsync(), current.CheckpointUsn!.Value + 1, 0, 0,
                [Directory(6, 2, "parent"), Directory(7, 6, "child")]));
            TestAssert.True(await Deleted() > deleted, "multiple structural changes use the full rebuild");
            TestAssert.Equal("renamed\\parent\\child", (string)(await ScalarAsync(path,
                "SELECT relative_path FROM catalog_directory_paths_v2 WHERE file_reference='0000000000000007';"))!, "batch child path follows its new parent");
            deleted = await Deleted();
            await Apply(Directory(8, 99, "orphan"));
            TestAssert.True(await Deleted() > deleted, "missing parent path uses the full resolver");
            TestAssert.Equal("orphan", (string)(await ScalarAsync(path,
                "SELECT relative_path FROM catalog_directory_paths_v2 WHERE file_reference='0000000000000008';"))!, "orphan fallback preserves prior path semantics");
            deleted = await Deleted();
            await Apply(Directory(99, 2, "restored"));
            TestAssert.True(await Deleted() > deleted, "new directory with existing child uses full resolver");
            TestAssert.Equal("renamed\\restored\\orphan", (string)(await ScalarAsync(path,
                "SELECT relative_path FROM catalog_directory_paths_v2 WHERE file_reference='0000000000000008';"))!, "late parent updates its existing child");
            deleted = await Deleted();
            await Apply(Directory(100,1,"one"),Directory(101,1,"two"));
            await Apply(Directory(100,2,"moved"),Directory(101,1,"renamed-two"));
            TestAssert.Equal(deleted,await Deleted(),"independent leaf create/move/rename never deletes unrelated paths");
            TestAssert.Equal("renamed\\moved",(string)(await ScalarAsync(path,"SELECT relative_path FROM catalog_directory_paths_v2 WHERE file_reference='0000000000000064';"))!,"batch move follows unchanged parent");
            await ScalarAsync(path,"CREATE TRIGGER reject_batch_path BEFORE INSERT ON catalog_directory_paths_v2 WHEN NEW.file_reference='0000000000000067' BEGIN SELECT RAISE(ABORT,'batch rollback'); END;");
            before=(await database.ReadVolumeAsync("fixture"))!;revision=await database.ReadRevisionAsync();
            try{await Apply(Directory(100,1,"rolled-back"),Directory(103,1,"rejected"));throw new Exception("batch failure accepted");}catch(SqliteException){}
            TestAssert.Equal(before,(await database.ReadVolumeAsync("fixture"))!,"batch failure rolls back checkpoint and volume");
            TestAssert.Equal(revision,await database.ReadRevisionAsync(),"batch failure rolls back revision");
            TestAssert.Equal("renamed\\moved",(string)(await ScalarAsync(path,"SELECT relative_path FROM catalog_directory_paths_v2 WHERE file_reference='0000000000000064';"))!,"later failure rolls back earlier path update");
            TestAssert.Equal(0L,Convert.ToInt64(await ScalarAsync(path,"SELECT count(*) FROM catalog_nodes_v2 WHERE file_reference='0000000000000067';")),"failed batch leaves no new node");
            await ScalarAsync(path,"DROP TRIGGER reject_batch_path;");
            await Apply(Directory(100,2,"moved",false),Directory(101,1,"renamed-two",false));
            TestAssert.Equal(deleted+2,await Deleted(),"batch deletion removes exactly its two paths");
            deleted=await Deleted();
            await Apply(Enumerable.Range(1000,33).Select(id=>Directory(id,1,"overflow-"+id)).ToArray());
            TestAssert.True(await Deleted()>deleted,"33 directory changes keep complete rebuild fallback");
            await ScalarAsync(path,"CREATE TABLE path_insert_audit(total INTEGER NOT NULL); INSERT INTO path_insert_audit VALUES(0); CREATE TRIGGER audit_preflight AFTER INSERT ON catalog_directory_paths_v2 WHEN NEW.file_reference='00000000000000C8' BEGIN UPDATE path_insert_audit SET total=total+1; END;");
            await Apply(Directory(200,1,"safe-first"),Directory(201,9999,"missing-parent"));
            TestAssert.Equal(1L,Convert.ToInt64(await ScalarAsync(path,"SELECT total FROM path_insert_audit;")),"failed preflight does not partially write before fallback rebuild");
            before=(await database.ReadVolumeAsync("fixture"))!;revision=await database.ReadRevisionAsync();
            using(var cancelled=new CancellationTokenSource()){
                cancelled.Cancel();
                await TestAssert.ThrowsAsync<OperationCanceledException>(()=>database.ApplyMaintenanceBatchAsync(new("fixture",before.JournalId,before.CheckpointUsn,revision,before.CheckpointUsn!.Value+1,0,0,[Directory(202,1,"cancelled"),Directory(203,1,"cancelled-two")]),cancelled.Token),"cancelled batch is not published");
            }
            TestAssert.Equal(revision,await database.ReadRevisionAsync(),"cancellation preserves revision");
            TestAssert.Equal(before,(await database.ReadVolumeAsync("fixture"))!,"cancellation preserves checkpoint");
            deleted=await Deleted();
            await Apply(Directory(1,1,"."));
            TestAssert.True(await Deleted()>deleted,"changed root identity keeps complete rebuild fallback");
            TestAssert.True(await database.CheckIntegrityAsync(), "path changes preserve integrity");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
    private static async Task<object?> ScalarAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection($"Data Source={path};Pooling=False"); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; return await command.ExecuteScalarAsync();
    }
}
