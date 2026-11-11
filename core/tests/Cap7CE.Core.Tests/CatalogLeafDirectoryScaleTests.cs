using Cap7CE.Core.Catalog;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogLeafDirectoryScaleTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-leaf-scale-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); var path = Path.Combine(root, "catalog.db");
        try {
            var database = new CatalogV2Database(path); await database.InitializeAsync();
            await using (var connection = new SqliteConnection($"Data Source={path};Pooling=False")) {
                await connection.OpenAsync(); using var command = connection.CreateCommand();
                command.CommandText = """
                    BEGIN;
                    INSERT INTO catalog_volumes_v2 VALUES('scale','X:','NTFS',1,'0000000000000001',1,0,0,'ready',100001,100001,0);
                    INSERT INTO catalog_nodes_v2 VALUES('scale','0000000000000001',NULL,'.','',1,16,1,0,1,1);
                    WITH RECURSIVE seq(x) AS (VALUES(2) UNION ALL SELECT x+1 FROM seq WHERE x<100001)
                    INSERT INTO catalog_nodes_v2 SELECT 'scale',printf('%016X',x),'0000000000000001','dir-'||x,'',1,16,1,0,1,1 FROM seq;
                    INSERT INTO catalog_directory_paths_v2 SELECT volume_id,file_reference,CASE WHEN name='.' THEN '' ELSE name END FROM catalog_nodes_v2;
                    COMMIT;
                    """;
                await command.ExecuteNonQueryAsync();
            }
            var allocated = GC.GetTotalAllocatedBytes(true);
            foreach (var exists in new[] { true, false }) {
                var volume = (await database.ReadVolumeAsync("scale"))!;
                var nodes = Enumerable.Range(200000,32).Select(id=>new CatalogV2NodeRecord(new("scale",id.ToString("X16")), "0000000000000001", "new-leaf-"+id, "", true, 16, exists, 0, 1, 2)).ToArray();
                await database.ApplyMaintenanceBatchAsync(new("scale", volume.JournalId, volume.CheckpointUsn,
                    await database.ReadRevisionAsync(), volume.CheckpointUsn!.Value + 1, 0, 0, nodes));
            }
            var bytes = GC.GetTotalAllocatedBytes(true) - allocated;
            TestAssert.True(bytes < 20 * 1024 * 1024, "bounded leaf batches must not materialize the 100,000 unrelated directory paths");
            await using var check = new SqliteConnection($"Data Source={path};Pooling=False"); await check.OpenAsync();
            using var query = check.CreateCommand();
            query.CommandText = "SELECT count(*) FROM catalog_directory_paths_v2;";
            TestAssert.Equal(100001L, Convert.ToInt64(await query.ExecuteScalarAsync()), "scale leaf removal preserves all unrelated paths");
            query.CommandText = "SELECT relative_path FROM catalog_directory_paths_v2 WHERE file_reference='00000000000186A1';";
            TestAssert.Equal("dir-100001", (string)(await query.ExecuteScalarAsync())!, "unrelated path content retained");
            Console.WriteLine($"32-leaf directory batch scale passed: 100,000 unrelated directories, {bytes:N0} allocated bytes, create/delete intact.");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
}
