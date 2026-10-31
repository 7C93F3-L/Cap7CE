using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.Keywords;
using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogKeywordTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-keywords-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var path = Path.Combine(root, "catalog.db"); var catalog = new CatalogV2Database(path); await catalog.InitializeAsync();
            async Task Sql(string sql)
            {
                await using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
                using var command = connection.CreateCommand(); command.CommandText = sql; await command.ExecuteNonQueryAsync();
            }
            await Sql("""
                INSERT INTO catalog_volumes_v2 VALUES('a','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000001',NULL,'.','',1,16,1,NULL,10000,10000);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000002','0000000000000001','sub','',1,16,1,NULL,10000,10000);
                INSERT INTO catalog_directory_paths_v2 VALUES('a','0000000000000001','');
                INSERT INTO catalog_directory_paths_v2 VALUES('a','0000000000000002','sub');
                """);
            var store = new CatalogKeywordStore(path);
            for (var i = 0; i < 20; i++)
            {
                await Sql($"INSERT INTO catalog_nodes_v2 VALUES('a','{i + 16:x16}','000000000000000{(i % 2 == 0 ? 1 : 2)}','file{i:00}.png','.png',0,{(i == 19 ? 2 : 32)},1,{100 + i},10000,{10000 + i});");
                var saved = await store.WriteAsync(new("a", $"{i + 16:x16}", "1"), [" 天空 ", "blue", "blue"], null);
                TestAssert.True(saved.Saved && saved.Current.Keywords.SequenceEqual(new[] { "天空", "blue" }), "normalization is shared with editor semantics");
            }
            await using var runtime = new ProductCoreRuntime(catalog, new NoReader());
            var dispatcher = new CoreRequestDispatcher(runtime, new ProductSearchCursorCodec()); var sequence = 0;
            async Task<CoreResponseEnvelope> Send(string operation, object body) => await dispatcher.DispatchAsync(
                new(1, "keywords-" + ++sequence, operation, 5000, CoreProtocolJson.ToElement(body)), CancellationToken.None);
            async Task<SearchPageResponse> Search(SearchStartRequest request) => ProtocolClient.ReadBody<SearchPageResponse>(await Send(CoreOperations.SearchStart, request));
            var original = new SearchStartRequest("天空", 100, CoreSearchSorts.NameAscending, [], TextTarget: "name-path-or-keywords");
            TestAssert.True(dispatcher.Capabilities.Contains("search.manualKeywords"), "host advertises manual keyword search");
            TestAssert.Equal(20, (await Search(original)).Items.Count, "unicode annotations participate before pagination");
            TestAssert.Equal(0, (await Search(original with { TextTarget = "name-or-path" })).Items.Count, "legacy explicit text targets remain unchanged");
            foreach (var sort in new[] { CoreSearchSorts.NameAscending, CoreSearchSorts.NameDescending, CoreSearchSorts.ModifiedAscending, CoreSearchSorts.ModifiedDescending })
                foreach (var seed in new uint?[] { null, 29 })
                {
                    var request = original with { Sort = sort, RandomSeed = seed, Continuation = "live" };
                    var expected = (await Search(request)).Items.Select(item => item.Id).ToArray();
                    var page = await Search(request with { PageSize = 3 }); var ids = page.Items.Select(item => item.Id).ToList();
                    while (page.NextCursor is { } cursor)
                    {
                        TestAssert.True(ids.Count < 30, "keyword pagination terminates");
                        page = ProtocolClient.ReadBody<SearchPageResponse>(await Send(CoreOperations.SearchNextPage, new SearchNextPageRequest(cursor)));
                        ids.AddRange(page.Items.Select(item => item.Id));
                    }
                    TestAssert.True(ids.SequenceEqual(expected) && ids.Distinct().Count() == 20, "sort, random and signed pagination retain exact annotation matches");
                }
            TestAssert.Equal(10, (await Search(original with { Scope = new("direct-children", "a", "0000000000000001") })).Items.Count, "current-level scope is retained");
            TestAssert.Equal(9, (await Search(original with { Scope = new("directory-descendants", "a", "0000000000000002"), ExcludeHidden = true })).Items.Count, "recursive scope intersects hidden visibility");
            TestAssert.Equal(5, (await Search(original with { FileConditions = new(MinimumSizeBytes: 115) })).Items.Count, "file conditions intersect keyword matches");
            await Sql("UPDATE catalog_nodes_v2 SET name='renamed.png',parent_file_reference='0000000000000002',modified_utc_ticks=99999 WHERE file_reference='0000000000000010';");
            TestAssert.Equal(1, (await Search(original with { Query = "renamed 天空" })).Items.Count, "different terms can match name and annotations after rename/move/content changes");
            var identity = new CatalogKeywordIdentity("a", "0000000000000010", "1");
            var current = await store.ReadAsync(identity);
            TestAssert.True(!(await store.WriteAsync(identity, ["stale"], null)).Saved, "stale saves cannot overwrite newer tags");
            var cleared = await store.WriteAsync(identity, [], current.Revision); TestAssert.True(cleared.Saved, "empty tags persist");
            var imported = await store.ImportAsync([new("X:\\sub\\renamed.png", ["old"], "1")]);
            TestAssert.Equal(0, imported.Imported, "legacy import never resurrects explicitly cleared tags");
            await catalog.InitializeAsync();
            TestAssert.Equal(cleared.Current.Revision!, (await new CatalogKeywordStore(path).ReadAsync(identity)).Revision!, "annotations survive reconnect and schema initialization");
            await Sql("UPDATE catalog_nodes_v2 SET created_utc_ticks=20000 WHERE file_reference='0000000000000010';");
            TestAssert.Equal(0, (await store.ReadAsync(identity with { CreatedFileTimeMilliseconds = "2" })).Keywords.Count, "reused file identity never inherits prior user annotations");
            var invalid = await Send("keywords.read", new { identity });
            TestAssert.Equal(CoreErrorCodes.InvalidRequest, invalid.Error!.Code, "retired creation identity is rejected");
            invalid = await Send("keywords.read", new { identity = new CatalogKeywordIdentity("a", "0000000000000002", "1") });
            TestAssert.Equal(CoreErrorCodes.InvalidRequest, invalid.Error!.Code, "folder tagging is outside this round");
            invalid = await Send("keywords.write", new { identity, keywords = new[] { new string('x', 257) }, expectedRevision = (string?)null });
            TestAssert.Equal(CoreErrorCodes.InvalidRequest, invalid.Error!.Code, "oversized keyword values are rejected");
            await Sql("DELETE FROM catalog_manual_keywords WHERE file_reference='0000000000000011';");
            imported = await store.ImportAsync([new("x:\\SUB\\FILE01.PNG", ["legacy"], "1"), new("X:\\sub\\file03.png", ["wrong source"], "99")]);
            TestAssert.Equal(1, imported.Imported, "legacy compatibility matches case-insensitive path and creation time");
            TestAssert.Equal(1, (await Search(original with { Query = "legacy" })).Items.Count, "legacy imports immediately participate in Core search");
            var read = await Send("keywords.read", new { identity = new CatalogKeywordIdentity("a", "0000000000000011", "1") });
            TestAssert.True(ProtocolClient.ReadBody<CatalogKeywordSnapshot>(read).Keywords.SequenceEqual(new[] { "legacy" }), "real protocol reads the persisted tags");
            var changed = await Send("keywords.write", new { identity = new CatalogKeywordIdentity("a", "0000000000000011", "1"), keywords = new[] { "protocol" }, expectedRevision = ProtocolClient.ReadBody<CatalogKeywordSnapshot>(read).Revision });
            TestAssert.True(ProtocolClient.ReadBody<CatalogKeywordWriteResult>(changed).Saved, "real protocol writes succeed");
            TestAssert.Equal(1, (await Search(original with { Query = "protocol" })).Items.Count, "saved keywords are searchable");
            var retainedIdentity=new CatalogKeywordIdentity("a","0000000000000011","1");
            foreach(var state in new[]{"needsRebuild","building"}) {
                await Sql($"UPDATE catalog_volumes_v2 SET state='{state}' WHERE volume_id='a'");
                var retained=ProtocolClient.ReadBody<CatalogKeywordSnapshot>(await Send("keywords.read",new{identity=retainedIdentity}));
                var saved=ProtocolClient.ReadBody<CatalogKeywordWriteResult>(await Send("keywords.write",new{identity=retainedIdentity,keywords=new[]{state},expectedRevision=retained.Revision}));
                TestAssert.True(saved.Saved,"manual keywords use retained identity independently of whole-volume query readiness");
                TestAssert.False((await store.WriteAsync(retainedIdentity,["stale"],retained.Revision)).Saved,"stale keyword revisions remain rejected during rebuild");
                TestAssert.Equal(CoreErrorCodes.InvalidRequest,(await Send("keywords.read",new{identity=retainedIdentity with{CreatedFileTimeMilliseconds="99"}})).Error!.Code,"rebuild does not bypass creation identity checks");
                TestAssert.Equal(0,(await Search(original with{Query=state})).Items.Count,"allowing manual annotations must not expose a stale volume to search");
            }
            foreach(var state in new[]{"offline","disabled"}) {
                await Sql($"UPDATE catalog_volumes_v2 SET state='{state}' WHERE volume_id='a'");
                TestAssert.Equal(CoreErrorCodes.InvalidRequest,(await Send("keywords.read",new{identity=retainedIdentity})).Error!.Code,"unavailable volumes still reject keyword access");
            }
            await Sql("UPDATE catalog_volumes_v2 SET state='needsRebuild',selected=0 WHERE volume_id='a'");
            TestAssert.Equal(CoreErrorCodes.InvalidRequest,(await Send("keywords.write",new{identity=retainedIdentity,keywords=new[]{"blocked"},expectedRevision=(string?)null})).Error!.Code,"deselected volumes cannot be annotated");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
    private sealed class NoReader : ICatalogReaderSessionFactory
    {
        public Task<ICatalogReaderSession> ConnectAsync(CancellationToken token) => throw new InvalidOperationException("Keywords must not start Reader.");
    }
}
