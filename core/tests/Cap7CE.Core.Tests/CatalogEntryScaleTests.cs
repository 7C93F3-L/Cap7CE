using System.Diagnostics;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogEntryScaleTests
{
    public static async Task RunAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        var catalog = new CatalogV2Database(fixture.DatabasePath); await catalog.InitializeAsync();
        await new CatalogFileEntryStore(catalog).InitializeAsync();
        await using (var connection = new SqliteConnection($"Data Source={fixture.DatabasePath};Pooling=False")) {
            await connection.OpenAsync(); using var command = connection.CreateCommand();
            command.CommandText = """
                BEGIN;
                INSERT INTO catalog_volumes_v2 VALUES('scale','X:','NTFS',1,'1',1,0,0,'ready',1000002,1000002,0);
                INSERT INTO catalog_nodes_v2 VALUES('scale','0000000000000001',NULL,'root','',1,16,1,NULL,1,1),
                    ('scale','0000000000000002','0000000000000001','library','',1,16,1,NULL,1,1);
                INSERT INTO catalog_directory_paths_v2 VALUES('scale','0000000000000001',''),('scale','0000000000000002','library');
                WITH RECURSIVE files(x) AS(SELECT 1000 UNION ALL SELECT x+1 FROM files WHERE x<1000999)
                INSERT INTO catalog_nodes_v2 SELECT 'scale',printf('%016X',x),'0000000000000002',printf('asset-%06d.png',x),'.png',0,32,1,100,1,1 FROM files;
                INSERT INTO catalog_file_entry_sets SELECT volume_id,file_reference,created_utc_ticks FROM catalog_nodes_v2 WHERE is_directory=0;
                INSERT INTO catalog_file_entries SELECT volume_id,file_reference,printf('%064s',file_reference),parent_file_reference,name,extension FROM catalog_nodes_v2 WHERE is_directory=0;
                WITH RECURSIVE files(x) AS(SELECT 1000 UNION ALL SELECT x+1 FROM files WHERE x<10999)
                INSERT INTO catalog_file_entries SELECT 'scale',printf('%016X',x),printf('%064X',x+1000000),
                    CASE WHEN x<1100 THEN '0000000000000001' ELSE '0000000000000002' END,printf('alias-%06d.png',x),'.png' FROM files;
                COMMIT;
                """;
            await command.ExecuteNonQueryAsync();
        }
        await using var runtime = new ProductCoreRuntime(catalog, new SyntheticCatalogReader());
        var dispatcher = new CoreRequestDispatcher(runtime, new ProductSearchCursorCodec()); var sequence = 0;
        async Task<SearchPageResponse> Send(string operation, object body) => ProtocolClient.ReadBody<SearchPageResponse>(await dispatcher.DispatchAsync(
            new(1, "entry-scale-" + ++sequence, operation, 2_000, CoreProtocolJson.ToElement(body)), CancellationToken.None));
        var watch = Stopwatch.StartNew();
        var page = await Send(CoreOperations.SearchStart, new SearchStartRequest("", 17, "name-ascending", ["scale"],
            new("direct-children", "scale", "0000000000000001"), EntryType: "file"));
        var firstMs = watch.Elapsed.TotalMilliseconds; var ids = new List<string>();
        while (true) {
            ids.AddRange(page.Items.Select(item => item.Id));
            if (page.NextCursor is null) break;
            page = await Send(CoreOperations.SearchNextPage, new SearchNextPageRequest(page.NextCursor));
        }
        TestAssert.Equal(100, ids.Count, "large active projection scopes noncanonical child names exactly");
        TestAssert.Equal(100, ids.Distinct().Count(), "signed alias continuation has no omissions or duplicates");
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        var request = new SearchStartRequest("", 100, "name-ascending", ["scale"], new("all-volumes"), EntryType: "file");
        watch.Restart(); var all = await runtime.QueryAsync(request, null, deadline.Token); var globalMs = watch.Elapsed.TotalMilliseconds;
        TestAssert.Equal(100, all.Items.Count, "large active projection returns a bounded global page");
        watch.Restart(); var hit = await runtime.QueryAsync(request with { Query = "asset-001005" }, null, deadline.Token);
        var nameHitMs = watch.Elapsed.TotalMilliseconds;
        TestAssert.Equal("asset-001005.png", hit.Items.Single().Name, "large global name search finds the exact entry");
        var queue = new FileFactQueue(fixture.DatabasePath); await queue.InitializeAsync();
        var policy = new FileFactQueuePolicy(["scale"], [new("scale", "0000000000000001")], []);
        await queue.SetPolicyAsync(policy); watch.Restart();
        var jobs = (await new FileFactDiscovery(fixture.DatabasePath).ReadPageAsync(policy, FileFactKind.ImageDimensions, 1, [".png"], pageSize: 32, token: deadline.Token)).Jobs;
        TestAssert.Equal(32, jobs.Count, "large multi-entry discovery stays bounded");
        TestAssert.Equal(32, jobs.Select(job => job.Identity).Distinct().Count(), "large multi-entry discovery deduplicates physical files");
        var discoveryMs = watch.Elapsed.TotalMilliseconds;
        var selected = new CatalogEntryIdentity("scale", "00000000000003ED");
        var facts = new FileFactDatabase(fixture.DatabasePath); var source = (await facts.CaptureAsync(selected))!;
        await facts.PublishAsync(new(selected, source, FileFactKind.ImageDimensions, 1, FileFactState.Indexed, 640, 480));
        var factQuery = new CatalogV2Query("", ["scale"], CatalogQueryScope.DirectChildren("scale", "0000000000000001"),
            null, CatalogEntryType.File, 100, null, Facts: new(FileFactKind.ImageDimensions, 1, MinimumWidth: 600));
        TestAssert.Equal("alias-001005.png", (await catalog.QueryAsync(factQuery)).Items.Single().Name, "large fact-first scoped query resolves the actual entry");
        await catalog.SaveScopeAsync(new("library", new("scale", "0000000000000002"), 1));
        using var scopeDeadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        TestAssert.Equal(0, (await catalog.QueryAsync(factQuery with { Query = "alias-001005", Scope = CatalogQueryScope.Saved("library"), Facts = null }, scopeDeadline.Token)).Items.Count,
            "saved scope cannot leak an external alias of an internal physical file");
        TestAssert.Equal("asset-001005.png", (await catalog.QueryAsync(factQuery with { Query = "asset-001005", Scope = CatalogQueryScope.Descendants("scale", "0000000000000001"), Facts = null }, scopeDeadline.Token)).Items.Single().Name,
            "recursive directory scope resolves the internal entry in a large library");
        Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new { entryScalePhysicalFiles = 1000000, entryScaleNames = 1010000,
            entryChildPageMs = Math.Round(firstMs, 2), entryGlobalPageMs = Math.Round(globalMs, 2), entryNameHitMs = Math.Round(nameHitMs, 2), entryFactDiscoveryMs = Math.Round(discoveryMs, 2) }));
        TestAssert.True(await catalog.CheckIntegrityAsync(), "large entry fixture retains SQLite integrity");
    }
}
