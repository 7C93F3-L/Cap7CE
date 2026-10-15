using Cap7CE.Core.Catalog;
using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogOrderingTests
{
    public static async Task RunAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        var catalog = new CatalogV2Database(fixture.DatabasePath); await catalog.InitializeAsync();
        await using (var connection = new SqliteConnection($"Data Source={fixture.DatabasePath};Pooling=False"))
        {
            await connection.OpenAsync(); using var command = connection.CreateCommand();
            command.CommandText = """
                INSERT INTO catalog_volumes_v2 VALUES('a','X:','NTFS',1,'0000000000000001',1,0,0,'ready',8,8,0),('b','Y:','NTFS',1,'0000000000000002',1,0,0,'ready',6,6,0);
                INSERT INTO catalog_nodes_v2 VALUES
                ('a','0001000000000010','0001000000000005','alpha.png','.png',0,32,1,10,1,5),
                ('a','0001000000000011','0001000000000005','same.png','.png',0,32,1,10,1,3),
                ('a','0001000000000012','0001000000000005','same.png','.png',0,32,1,10,1,3),
                ('a','0001000000000013','0001000000000005','hiddenFolder','',1,18,1,0,1,9),
                ('a','0001000000000014','0001000000000005','same.png','',1,16,1,0,1,3),
                ('a','0001000000000015','0001000000000005','SAME.png','',1,16,1,0,1,3),
                ('a','0001000000000016','0001000000000005','zzzFolder','',1,16,1,0,1,NULL),
                ('a','0001000000000020','0001000000000014','nested.png','.png',0,32,1,10,1,1),
                ('b','0001000000000010','0001000000000005','same.png','.png',0,32,1,10,1,3),
                ('b','0001000000000011','0001000000000005','zeta.png','.png',0,32,1,10,1,NULL),
                ('b','0001000000000012','0001000000000005','folder','',1,16,1,0,1,7),
                ('b','0001000000000014','0001000000000005','alphaFolder','',1,16,1,0,1,2),
                ('b','0001000000000015','0001000000000005','same.png','',1,16,1,0,1,3),
                ('b','0001000000000013','0001000000000005','hidden.png','.png',0,34,1,10,1,2);
                """;
            await command.ExecuteNonQueryAsync();
        }
        await using var runtime = new ProductCoreRuntime(catalog, new SyntheticCatalogReader());
        var dispatcher = new CoreRequestDispatcher(runtime, new ProductSearchCursorCodec()); var sequence = 0;
        async Task<SearchPageResponse> Send(string operation, object body) => ProtocolClient.ReadBody<SearchPageResponse>(await dispatcher.DispatchAsync(
            new(1, "ordering-" + ++sequence, operation, 5_000, CoreProtocolJson.ToElement(body)), CancellationToken.None));
        var all = (await catalog.QueryAsync(new("", [], CatalogQueryScope.AllVolumes(), null, CatalogEntryType.Any, 100, null))).Items;
        foreach (var sort in new[] { CoreSearchSorts.NameAscending, CoreSearchSorts.NameDescending, CoreSearchSorts.ModifiedAscending, CoreSearchSorts.ModifiedDescending })
        foreach (var hidden in new[] { true, false })
        foreach (var scope in new CoreSearchScopeRequest?[] { null, new("direct-children", "a", "0001000000000005"), new("direct-children", "b", "0001000000000005"), new("directory-descendants", "a", "0001000000000005") })
        foreach (var entryType in new[] { "any", "file", "directory" })
        foreach (var continuation in new string?[] { null, "live" })
        foreach (var pageSize in new[] { 1, 3, 100 })
        {
            var source = all.Where(item => (!hidden || (item.Attributes & 2) == 0)
                && (scope is null || item.Identity.VolumeId == scope.VolumeId)
                && (scope?.Kind != "direct-children" || item.Name != "nested.png")
                && (entryType == "any" || item.IsDirectory == (entryType == "directory")));
            var groups = source.OrderByDescending(item => scope?.Kind == "direct-children" && item.IsDirectory);
            var ordered = sort switch {
                CoreSearchSorts.NameDescending => groups.ThenByDescending(item => item.Name, StringComparer.OrdinalIgnoreCase),
                CoreSearchSorts.ModifiedAscending => groups.ThenBy(item => item.ModifiedUtcTicks ?? -1).ThenBy(item => item.Name, StringComparer.OrdinalIgnoreCase),
                CoreSearchSorts.ModifiedDescending => groups.ThenByDescending(item => item.ModifiedUtcTicks ?? -1).ThenBy(item => item.Name, StringComparer.OrdinalIgnoreCase),
                _ => groups.ThenBy(item => item.Name, StringComparer.OrdinalIgnoreCase) };
            var expected = ordered.ThenBy(item => item.Identity.VolumeId).ThenBy(item => item.Identity.FileReference)
                .Select(item => item.Identity.VolumeId + ":" + item.Identity.FileReference).ToArray();
            var page = await Send(CoreOperations.SearchStart, new SearchStartRequest("", pageSize, sort, [], Scope: scope, EntryType: entryType, ExcludeHidden: hidden, Continuation: continuation));
            var actual = new List<string>(); var cursors = new HashSet<string>();
            while (true) {
                actual.AddRange(page.Items.Select(item => item.VolumeId + ":" + item.FileReference));
                if (page.NextCursor is null) break;
                TestAssert.True(cursors.Add(page.NextCursor), "sort cursor must advance");
                page = await Send(CoreOperations.SearchNextPage, new SearchNextPageRequest(page.NextCursor));
            }
            TestAssert.True(expected.SequenceEqual(actual), $"{sort}, hidden={hidden}, scope={scope?.Kind}/{scope?.VolumeId}, type={entryType}, continuation={continuation}, page={pageSize}: folder groups, complete order, tie identities, nullable time and filter survive signed pagination");
        }
    }
}
