using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactScopeScaleTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-scope-scale-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "catalog.db");
        try
        {
            await new CatalogV2Database(path).InitializeAsync();
            var queue = new FileFactQueue(path); await queue.InitializeAsync();
            await using (var connection = new SqliteConnection($"Data Source={path};Pooling=False"))
            {
                await connection.OpenAsync(); using var command = connection.CreateCommand();
                command.CommandText = """
                    INSERT INTO catalog_volumes_v2 VALUES('fixture','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                    INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000001',NULL,'root','',1,16,1,0,1,1);
                    INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000002','0000000000000001','allowed','',1,16,1,0,1,1);
                    WITH RECURSIVE levels(x) AS(SELECT 3 UNION ALL SELECT x+1 FROM levels WHERE x<20)
                    INSERT INTO catalog_nodes_v2 SELECT 'fixture',printf('%016X',x),printf('%016X',CASE WHEN x=3 THEN 1 ELSE x-1 END),'other','',1,16,1,0,1,1 FROM levels;
                    WITH RECURSIVE files(x) AS(SELECT 1000 UNION ALL SELECT x+1 FROM files WHERE x<150999)
                    INSERT INTO catalog_nodes_v2 SELECT 'fixture',printf('%016X',x),'0000000000000014','unrelated.txt','.txt',0,32,1,100,1,1 FROM files;
                    INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000064','0000000000000002','one.png','.png',0,32,1,100,1,1);
                    INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000065','0000000000000002','two.png','.png',0,32,1,100,1,1);
                    INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000066','0000000000000002','three.png','.png',0,32,1,100,1,1);
                    """;
                await command.ExecuteNonQueryAsync();
            }
            var policy = new FileFactQueuePolicy(["fixture"], [new("fixture", "0000000000000002")], []);
            await queue.SetPolicyAsync(policy);
            using var discoveryDeadline = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            var page = await new FileFactDiscovery(path).ReadPageAsync(policy, FileFactKind.ImageDimensions, 2, [".png"], token: discoveryDeadline.Token);
            TestAssert.Equal(3, page.Jobs.Count, "small image scope excludes 150,000 unrelated deep-parent entries within the foreground deadline");
            await queue.EnqueueAsync(page.Jobs);
            using var statusDeadline = new CancellationTokenSource(TimeSpan.FromSeconds(2));
            var ledger = await new FileFactQueueDiagnostics(path).ReadAsync(FileFactKind.ImageDimensions, 2, statusDeadline.Token);
            TestAssert.Equal(3L, ledger.PendingJobs, "queue status scales with matching jobs and preserves the scoped count");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
}
