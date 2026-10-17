using System.Diagnostics;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogRandomOrderingTests
{
    public static async Task RunAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        var catalog = new CatalogV2Database(fixture.DatabasePath); await catalog.InitializeAsync();
        await using (var connection = new SqliteConnection($"Data Source={fixture.DatabasePath};Pooling=False")) {
            await connection.OpenAsync(); using var command = connection.CreateCommand();
            command.CommandText = """
                INSERT INTO catalog_volumes_v2 VALUES('fixture','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000001',NULL,'root','',1,16,1,0,1,1);
                INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000002','0000000000000001','folder','',1,16,1,0,1,1);
                INSERT INTO catalog_directory_paths_v2 VALUES('fixture','0000000000000001','');
                INSERT INTO catalog_directory_paths_v2 VALUES('fixture','0000000000000002','folder');
                WITH RECURSIVE files(x) AS(SELECT 1000 UNION ALL SELECT x+1 FROM files WHERE x<1001099)
                INSERT INTO catalog_nodes_v2 SELECT 'fixture',printf('%016X',x),CASE WHEN x<1100 THEN '0000000000000001' ELSE '0000000000000002' END,
                    printf('asset-%07d.png',x),'.png',0,CASE WHEN x%3=0 THEN 34 ELSE 32 END,1,100,1,1 FROM files;
                """;
            await command.ExecuteNonQueryAsync();
        }
        await using var runtime = new ProductCoreRuntime(catalog, new SyntheticCatalogReader());
        var dispatcher = new CoreRequestDispatcher(runtime, new ProductSearchCursorCodec()); var sequence = 0;
        async Task<SearchPageResponse> Send(string operation, object body) => ProtocolClient.ReadBody<SearchPageResponse>(await dispatcher.DispatchAsync(
            new(1, "random-" + ++sequence, operation, 15_000, CoreProtocolJson.ToElement(body)), CancellationToken.None));
        var start = new SearchStartRequest("", 7, "name-ascending", ["fixture"], new("direct-children", "fixture", "0000000000000001"),
            ExcludeHidden: true, RandomSeed: 42);
        async Task<string[]> Drain(SearchStartRequest request) {
            var page = await Send(CoreOperations.SearchStart, request); var result = new List<string>();
            while (true) {
                result.AddRange(page.Items.Select(item => item.FileReference!));
                if (page.NextCursor is null) break;
                page = await Send(CoreOperations.SearchNextPage, new SearchNextPageRequest(page.NextCursor));
            }
            return result.ToArray();
        }
        var first = await Drain(start); var repeat = await Drain(start with { PageSize = 19, Sort = "modified-descending" });
        TestAssert.True(first.SequenceEqual(repeat), "seed ordering is stable across refresh, page sizes and previous normal sort");
        TestAssert.Equal(first.Length, first.Distinct().Count(), "signed random pages neither repeat nor omit an identity");
        TestAssert.Equal("0000000000000002", first[0], "directory browsing retains its pinned folder group");
        TestAssert.Equal(68, first.Length, "current-child scope and hidden-file predicate remain exact");
        TestAssert.False(first.SequenceEqual(await Drain(start with { RandomSeed = 43 })), "next seed changes the batch order");
        var global = start with { Scope = new("all-volumes"), EntryType = "file", PageSize = 100, Continuation = "live" };
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var watch = Stopwatch.StartNew();
        var page1 = await runtime.QueryAsync(global, null, deadline.Token);
        var firstMs = watch.Elapsed.TotalMilliseconds; watch.Restart();
        var page2 = await runtime.QueryAsync(global, page1.Next, deadline.Token);
        TestAssert.Equal(100, page1.Items.Count, "million-entry query returns only one bounded page");
        TestAssert.Equal(100, page2.Items.Count, "million-entry continuation remains bounded");
        TestAssert.False(page1.Items.Select(item => item.Identity).Intersect(page2.Items.Select(item => item.Identity)).Any(), "random continuation advances across large result sets");
        Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new { randomScaleRows = 1000100, randomFirstPageMs = Math.Round(firstMs, 2), randomNextPageMs = Math.Round(watch.Elapsed.TotalMilliseconds, 2) }));
        using var stopped = new CancellationTokenSource(); stopped.Cancel();
        await TestAssert.ThrowsAsync<OperationCanceledException>(() => runtime.QueryAsync(global, null, stopped.Token), "cancelled random query does not complete a result");
        TestAssert.True(await catalog.CheckIntegrityAsync(), "random browsing does not modify Catalog content or schema");
    }
}
