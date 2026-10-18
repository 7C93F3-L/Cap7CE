using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogFileEntryQueryTests
{
    public static async Task RunAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        var catalog = new CatalogV2Database(fixture.DatabasePath); await catalog.InitializeAsync();
        await using (var connection = new SqliteConnection($"Data Source={fixture.DatabasePath};Pooling=False")) {
            await connection.OpenAsync(); using var command = connection.CreateCommand();
            command.CommandText = """
                INSERT INTO catalog_volumes_v2 VALUES('links','X:','NTFS',1,'1',1,0,0,'ready',4,4,0);
                INSERT INTO catalog_nodes_v2 VALUES
                ('links','0000000000000010',NULL,'one','',1,16,1,NULL,1,2),
                ('links','0000000000000011',NULL,'two','',1,16,1,NULL,1,2),
                ('links','0000000000000020','0000000000000010','old.png','.png',0,32,1,10,1,2),
                ('links','0000000000000021','0000000000000010','z.png','.png',0,32,1,20,1,3);
                INSERT INTO catalog_directory_paths_v2 VALUES('links','0000000000000010','one'),('links','0000000000000011','two');
                INSERT INTO catalog_saved_scopes_v2 VALUES('saved','links','0000000000000010',1);
                INSERT INTO catalog_manual_keywords VALUES('links','0000000000000020','1','["shared"]','shared',0);
                """;
            await command.ExecuteNonQueryAsync();
        }
        var identity = new CatalogEntryIdentity("links", "0000000000000020");
        var store = new CatalogFileEntryStore(catalog); await store.InitializeAsync();
        await store.ReplaceAsync(identity, new(1, 2, 10), 0,
            [new("0000000000000010", "same.png"), new("0000000000000011", "same.png"), new("0000000000000011", "other.txt")]);
        var query = new CatalogV2Query("", [], CatalogQueryScope.AllVolumes(), null, CatalogEntryType.Any, 100, null);
        var all = (await catalog.QueryAsync(query)).Items;
        TestAssert.Equal(6, all.Count, "two directories, three entries of one file and one ordinary file");
        TestAssert.Equal(3, all.Count(item => item.Identity == identity), "physical identity is shared, entries are not deduplicated");
        TestAssert.Equal(3, all.Where(item => item.Identity == identity).Select(item => item.EntryKey).Distinct().Count(), "each entry owns a result identity");
        TestAssert.False(all.Any(item => item.Name == "old.png"), "complete entry set overrides stale canonical name");
        foreach (var scope in new[] { CatalogQueryScope.DirectChildren("links", "0000000000000010"),
            CatalogQueryScope.Descendants("links", "0000000000000010"), CatalogQueryScope.Saved("saved") }) {
            var one = (await catalog.QueryAsync(query with { Scope = scope })).Items;
            TestAssert.Equal(2, one.Count, "scope includes names in this directory only");
            TestAssert.True(one.All(item => item.RelativePath.StartsWith("one\\", StringComparison.Ordinal)), "shared file identity cannot leak sibling-directory names into scope");
        }
        var two = (await catalog.QueryAsync(query with { Scope = CatalogQueryScope.DirectChildren("links", "0000000000000011") })).Items;
        TestAssert.Equal(2, two.Count, "directory absent from primary file path still contains both entries");
        TestAssert.True(two.All(item => item.RelativePath.StartsWith("two\\", StringComparison.Ordinal)), "display path comes from this entry's parent");
        TestAssert.Equal("other.txt", (await catalog.QueryAsync(query with { Query = "other", Extension = ".txt" })).Items.Single().Name, "alias name and extension filters use entry data");
        TestAssert.Equal(3, (await catalog.QueryAsync(query with { Query = "shared", TextTarget = CatalogQueryTextTarget.NamePathOrKeywords })).Items.Count, "one physical annotation matches all names");
        TestAssert.Equal(3, (await catalog.QueryAsync(query with { Query = "two", TextTarget = CatalogQueryTextTarget.Path })).Items.Count, "path query includes directory and its two entries");
        var facts = new FileFactDatabase(fixture.DatabasePath); await facts.InitializeAsync();
        var source = (await facts.CaptureAsync(identity))!;
        await facts.PublishAsync(new(identity, source, FileFactKind.ImageDimensions, 1, FileFactState.Indexed, 640, 480));
        TestAssert.Equal(3, (await catalog.QueryAsync(query with { Facts = new(FileFactKind.ImageDimensions, 1, MinimumWidth: 600) })).Items.Count, "all entries join one current fact without duplicated extraction");

        await using var runtime = new ProductCoreRuntime(catalog, new SyntheticCatalogReader());
        var dispatcher = new CoreRequestDispatcher(runtime, new ProductSearchCursorCodec()); var sequence = 0;
        async Task<SearchPageResponse> Send(string operation, object body) => ProtocolClient.ReadBody<SearchPageResponse>(await dispatcher.DispatchAsync(
            new(1, "entry-" + ++sequence, operation, 5_000, CoreProtocolJson.ToElement(body)), CancellationToken.None));
        foreach (var sort in new[] { CoreSearchSorts.NameAscending, CoreSearchSorts.NameDescending, CoreSearchSorts.ModifiedAscending, CoreSearchSorts.ModifiedDescending })
        foreach (var random in new uint?[] { null, 42 })
        foreach (var pageSize in new[] { 1, 2, 100 }) {
            var start = new SearchStartRequest("", pageSize, sort, [], RandomSeed: random);
            var page = await Send(CoreOperations.SearchStart, start); var items = new List<BasicSearchItem>(); var cursors = new HashSet<string>();
            while (true) {
                items.AddRange(page.Items); if (page.NextCursor is null) break;
                TestAssert.True(cursors.Add(page.NextCursor), "signed entry cursor always advances");
                page = await Send(CoreOperations.SearchNextPage, new SearchNextPageRequest(page.NextCursor));
            }
            TestAssert.Equal(6, items.Count, "signed pagination includes every entry at all ordering ties");
            TestAssert.Equal(6, items.Select(item => item.Id).Distinct().Count(), "renderer result IDs distinguish names sharing a physical file");
            TestAssert.True(all.Select(item => item.RelativePath).Order().SequenceEqual(items.Select(item => item.RelativePath).Order()), "paging preserves exact entry paths");
        }
        var strict = await Send(CoreOperations.SearchStart, new SearchStartRequest("", 1, CoreSearchSorts.NameAscending, []));
        await store.ReplaceAsync(identity, new(1, 2, 10), 1, [new("0000000000000010", "only.png")]);
        var stale = await dispatcher.DispatchAsync(new(1, "stale-entry", CoreOperations.SearchNextPage, 5_000,
            CoreProtocolJson.ToElement(new SearchNextPageRequest(strict.NextCursor!))), CancellationToken.None);
        TestAssert.Equal(CoreErrorCodes.InvalidCursor, stale.Error!.Code, "entry replacement invalidates strict result snapshots");
        TestAssert.Equal(1, (await catalog.QueryAsync(query with { Facts = new(FileFactKind.ImageDimensions, 1) })).Items.Count, "removing names preserves shared facts");
        await using (var connection = new SqliteConnection($"Data Source={fixture.DatabasePath};Pooling=False")) {
            await connection.OpenAsync(); using var command = connection.CreateCommand();
            command.CommandText = "UPDATE catalog_nodes_v2 SET exists_flag=0 WHERE file_reference='0000000000000010';";
            await command.ExecuteNonQueryAsync();
        }
        TestAssert.False((await catalog.QueryAsync(query)).Items.Any(item => item.Identity == identity), "retired parent hides explicit names even while an old path cache remains");
        TestAssert.True(await new FileFactSourceResolver(fixture.DatabasePath).ResolveAsync(identity) is null, "property source rejects an alias whose parent is gone");
    }
}
