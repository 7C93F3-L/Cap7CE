using Cap7CE.Core.Catalog;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogNaturalOrderingTests
{
    public static async Task RunAsync()
    {
        using var fixture=new TemporaryCatalogFixture();
        var catalog=new CatalogV2Database(fixture.DatabasePath);await catalog.InitializeAsync();
        var names=new[]{"目录1","目录10","目录11","目录12","目录12-org","目录2","目录3","目录9","目录02","目录2"};
        await using(var connection=new SqliteConnection($"Data Source={fixture.DatabasePath};Pooling=False")) {
            await connection.OpenAsync();using var command=connection.CreateCommand();
            command.CommandText="INSERT INTO catalog_volumes_v2 VALUES('a','X:','NTFS',1,'0000000000000001',1,0,0,'ready',10,10,0);";
            await command.ExecuteNonQueryAsync();
            for(var i=0;i<names.Length;i++) {
                command.CommandText="INSERT INTO catalog_nodes_v2 VALUES('a',$id,'0001000000000005',$name,'',1,16,1,0,1,3);";
                command.Parameters.Clear();command.Parameters.AddWithValue("$id",$"{i+16:X16}");command.Parameters.AddWithValue("$name",names[i]);
                await command.ExecuteNonQueryAsync();
            }
        }
        foreach(var sort in Enum.GetValues<CatalogQuerySort>()) {
            var query=new CatalogV2Query("",[],CatalogQueryScope.DirectChildren("a","0001000000000005"),null,CatalogEntryType.Any,100,null,Sort:sort);
            var whole=(await catalog.QueryAsync(query)).Items;
            var expected=sort==CatalogQuerySort.NameDescending
                ?new[]{"目录12-org","目录12","目录11","目录10","目录9","目录3","目录2","目录02","目录2","目录1"}
                :new[]{"目录1","目录2","目录02","目录2","目录3","目录9","目录10","目录11","目录12","目录12-org"};
            TestAssert.True(expected.SequenceEqual(whole.Select(i=>i.Name)),"Direct children use natural numbers, including equal numeric names and modified-time ties");
            foreach(var size in new[]{1,2,3}) {
                var actual=new List<string>();CatalogQueryCursorKey? after=null;
                do {
                    var page=await catalog.QueryAsync(query with{PageSize=size,After=after});
                    actual.AddRange(page.Items.Select(i=>i.Identity.FileReference));after=page.Next;
                    TestAssert.True(actual.Count<=names.Length,"Natural cursor must advance without duplicates");
                }while(after is not null);
                TestAssert.True(whole.Select(i=>i.Identity.FileReference).SequenceEqual(actual),"Natural ordering and cursor comparisons must agree on every page");
            }
        }
        Console.WriteLine("Natural directory ordering and cursor pagination checks passed.");
    }
}
