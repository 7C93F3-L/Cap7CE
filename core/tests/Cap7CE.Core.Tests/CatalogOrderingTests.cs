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
                INSERT INTO catalog_volumes_v2 VALUES('a','X:','NTFS',1,'0000000000000001',1,0,0,'ready',4,4,0),('b','Y:','NTFS',1,'0000000000000002',1,0,0,'ready',4,4,0);
                INSERT INTO catalog_nodes_v2 VALUES
                ('a','0001000000000010','0001000000000005','alpha.png','.png',0,32,1,10,1,5),
                ('a','0001000000000011','0001000000000005','same.png','.png',0,32,1,10,1,3),
                ('a','0001000000000012','0001000000000005','same.png','.png',0,32,1,10,1,3),
                ('a','0001000000000013','0001000000000005','hiddenFolder','',1,18,1,0,1,9),
                ('b','0001000000000010','0001000000000005','same.png','.png',0,32,1,10,1,3),
                ('b','0001000000000011','0001000000000005','zeta.png','.png',0,32,1,10,1,NULL),
                ('b','0001000000000012','0001000000000005','folder','',1,16,1,0,1,7),
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
        {
            var source = all.Where(item => !hidden || (item.Attributes & 2) == 0);
            var ordered = sort switch {
                CoreSearchSorts.NameDescending => source.OrderByDescending(item => item.Name, StringComparer.OrdinalIgnoreCase),
                CoreSearchSorts.ModifiedAscending => source.OrderBy(item => item.ModifiedUtcTicks ?? -1).ThenBy(item => item.Name, StringComparer.OrdinalIgnoreCase),
                CoreSearchSorts.ModifiedDescending => source.OrderByDescending(item => item.ModifiedUtcTicks ?? -1).ThenBy(item => item.Name, StringComparer.OrdinalIgnoreCase),
                _ => source.OrderBy(item => item.Name, StringComparer.OrdinalIgnoreCase) };
            var expected = ordered.ThenBy(item => item.Identity.VolumeId).ThenBy(item => item.Identity.FileReference)
                .Select(item => item.Identity.VolumeId + ":" + item.Identity.FileReference).ToArray();
            var page = await Send(CoreOperations.SearchStart, new SearchStartRequest("", 2, sort, [], ExcludeHidden: hidden, Continuation: "live"));
            var actual = new List<string>(); var cursors = new HashSet<string>();
            while (true) {
                actual.AddRange(page.Items.Select(item => item.VolumeId + ":" + item.FileReference));
                if (page.NextCursor is null) break;
                TestAssert.True(cursors.Add(page.NextCursor), "sort cursor must advance");
                page = await Send(CoreOperations.SearchNextPage, new SearchNextPageRequest(page.NextCursor));
            }
            TestAssert.True(expected.SequenceEqual(actual), $"{sort}, hidden={hidden}: complete order, tie identities, nullable time and filter survive signed pagination");
        }
    }
}
