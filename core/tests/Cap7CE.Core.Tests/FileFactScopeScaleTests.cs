using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Catalog.DirectoryEntries;
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
            var catalog=new CatalogV2Database(path);var entries=new CatalogFileEntryStore(catalog);await entries.InitializeAsync();
            await using(var connection=new SqliteConnection($"Data Source={path};Pooling=False")) {
                await connection.OpenAsync();using var command=connection.CreateCommand();
                command.CommandText="""
                    UPDATE catalog_nodes_v2 SET name='unrelated.png',extension='.png' WHERE file_reference>='00000000000003E8';
                    INSERT INTO catalog_directory_paths_v2 VALUES('fixture','0000000000000001',''),('fixture','0000000000000002','allowed');
                    """;
                await command.ExecuteNonQueryAsync();
            }
            foreach(var (reference,name) in new[]{("0000000000000064","one.png"),("0000000000000065","two.png"),("0000000000000066","three.png")})
                TestAssert.True(await entries.ReplaceAsync(new("fixture",reference),new(1,1,100),await catalog.ReadRevisionAsync(),[new("0000000000000002",name)]),"activate complete names for scoped fixtures");
            using var entryDeadline=new CancellationTokenSource(TimeSpan.FromSeconds(2));
            var entryPage=await new FileFactDiscovery(path).ReadPageAsync(policy,FileFactKind.ImageDimensions,2,[".png"],token:entryDeadline.Token);
            TestAssert.Equal(3,entryPage.Jobs.Count,"entry-aware discovery starts from the small subtree rather than 150,000 unrelated PNG files");
            // Simulate an earlier global queue: unrelated same-volume tasks precede the directory jobs.
            await using(var connection=new SqliteConnection($"Data Source={path};Pooling=False")) {
                await connection.OpenAsync();using var command=connection.CreateCommand();
                command.CommandText="""
                    DELETE FROM file_fact_jobs;
                    INSERT INTO file_fact_jobs(volume_id,file_reference,kind,extractor_version,size_bytes,modified_file_time,volume_epoch,content_revision,state)
                    SELECT volume_id,file_reference,0,2,100,1,0,0,'pending' FROM catalog_nodes_v2 WHERE file_reference>='00000000000003E8';
                    """;
                await command.ExecuteNonQueryAsync();
            }
            await queue.EnqueueAsync(entryPage.Jobs);
            using var claimDeadline=new CancellationTokenSource(TimeSpan.FromSeconds(2));
            var lease=(await queue.ClaimAsync(token:claimDeadline.Token))!;
            TestAssert.Equal("0000000000000064",lease.Job.Identity.FileReference,"directory claim preserves ordinal order after 150,000 unrelated pending jobs");
            using var sourceDeadline=new CancellationTokenSource(TimeSpan.FromSeconds(2));
            var source=await new FileFactSourceResolver(path).ResolveForLeaseAsync(lease,sourceDeadline.Token);
            TestAssert.True(source is not null&&source.RelativePath.StartsWith("allowed\\",StringComparison.Ordinal),"identity path resolution stays scoped with unrelated matching files");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
}
