using Cap7CE.Core.Catalog;
using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class UnclassifiedSearchTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-unclassified-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var path = Path.Combine(root, "catalog.db");
            var catalog = new CatalogV2Database(path);
            await catalog.InitializeAsync();
            await using (var connection = new SqliteConnection("Data Source=" + path))
            {
                await connection.OpenAsync();
                using var command = connection.CreateCommand();
                command.CommandText = """
                    INSERT INTO catalog_volumes_v2 VALUES('a','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                    INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000001',NULL,'.','',1,16,1,NULL,1,1);
                    INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000002','0000000000000001','nested','',1,16,1,NULL,1,1);
                    INSERT INTO catalog_directory_paths_v2 VALUES('a','0000000000000001','');
                    INSERT INTO catalog_directory_paths_v2 VALUES('a','0000000000000002','nested');
                    INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000010','0000000000000001','known.PNG','.PNG',0,32,1,100,1,100);
                    INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000011','0000000000000001','movie.mp4','.mp4',0,32,1,100,1,100);
                    INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000012','0000000000000001','other.custom','.custom',0,32,1,200,1,200);
                    INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000013','0000000000000001','README','',0,32,1,300,1,300);
                    INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000014','0000000000000002','inside.zzz','.zzz',0,32,1,400,1,400);
                    INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000015','0000000000000001','hidden.bak','.bak',0,2,1,500,1,500);
                    """;
                await command.ExecuteNonQueryAsync();
            }
            await using var runtime = new ProductCoreRuntime(catalog, new NoReader());
            var dispatcher = new CoreRequestDispatcher(runtime, new ProductSearchCursorCodec());
            var sequence = 0;
            async Task<CoreResponseEnvelope> Send(string operation, object request) => await dispatcher.DispatchAsync(
                new(1, "unclassified-" + ++sequence, operation, 5_000, CoreProtocolJson.ToElement(request)), CancellationToken.None);
            async Task<SearchPageResponse> Start(SearchStartRequest request) =>
                ProtocolClient.ReadBody<SearchPageResponse>(await Send(CoreOperations.SearchStart, request));
            var original = new SearchStartRequest("", 100, CoreSearchSorts.NameAscending, [],
                FileConditions: new(ExcludedExtensions: [".png", ".MP4"]));
            var all = await Start(original);
            TestAssert.Equal(4, all.Items.Count, "unknown extensions and extensionless files match; known formats and folders do not");
            TestAssert.True(all.Items.Any(item => item.Name == "README"), "extensionless file survives exclusion");
            foreach (var sort in new[] { CoreSearchSorts.NameAscending, CoreSearchSorts.NameDescending,
                CoreSearchSorts.ModifiedAscending, CoreSearchSorts.ModifiedDescending })
            {
                foreach (var seed in new uint?[] { null, 17 })
                {
                    var request = original with { Sort = sort, RandomSeed = seed, Continuation = "live" };
                    var expected = (await Start(request)).Items.Select(item => item.Id).ToArray();
                    var page = await Start(request with { PageSize = 1 });
                    var ids = page.Items.Select(item => item.Id).ToList();
                    while (page.NextCursor is { } cursor)
                    {
                        TestAssert.True(ids.Count < 10, "pagination remains bounded");
                        page = ProtocolClient.ReadBody<SearchPageResponse>(await Send(CoreOperations.SearchNextPage, new SearchNextPageRequest(cursor)));
                        ids.AddRange(page.Items.Select(item => item.Id));
                    }
                    TestAssert.True(ids.SequenceEqual(expected) && ids.Distinct().Count() == 4,
                        "signed live pages preserve exclusions, sorting and random order without omissions");
                }
            }
            var direct = original with { Scope = new("direct-children", "a", "0000000000000001"), ExcludeHidden = true };
            TestAssert.Equal(2, (await Start(direct)).Items.Count, "direct scope and hidden control intersect exclusions");
            TestAssert.Equal(1, (await Start(direct with { FileConditions = direct.FileConditions! with { MinimumSizeBytes = 250 } })).Items.Count,
                "size condition retains extensionless file");
            TestAssert.Equal(1, (await Start(original with { Scope = new("directory-descendants", "a", "0000000000000002") })).Items.Count,
                "recursive folder scope retains exclusions");
            TestAssert.Equal(1, (await Start(original with { Query = "README" })).Items.Count, "keywords intersect other files");
            TestAssert.Equal(0, (await Start(original with { FileConditions = original.FileConditions! with { Extensions = [".png"] } })).Items.Count,
                "contradictory inclusion never broadens search");
            foreach (var excluded in new[] { new[] { ".png", ".PNG" }, new[] { "" }, new[] { "../png" }, Enumerable.Repeat(".png", 129).ToArray() })
            {
                var invalid = await Send(CoreOperations.SearchStart, original with { FileConditions = new(ExcludedExtensions: excluded) });
                TestAssert.Equal(CoreErrorCodes.InvalidRequest, invalid.Error!.Code, "invalid exclusion list rejected");
            }
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }

    private sealed class NoReader : ICatalogReaderSessionFactory
    {
        public Task<ICatalogReaderSession> ConnectAsync(CancellationToken token) => throw new InvalidOperationException("Query must not connect Reader.");
    }
}
