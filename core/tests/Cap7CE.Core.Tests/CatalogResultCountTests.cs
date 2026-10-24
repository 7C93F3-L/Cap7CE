using Cap7CE.Core.Catalog;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogResultCountTests
{
    public static async Task RunAsync()
    {
        using var fixture=new TemporaryCatalogFixture();
        var catalog=new CatalogV2Database(fixture.DatabasePath);await catalog.InitializeAsync();
        await using(var connection=new SqliteConnection($"Data Source={fixture.DatabasePath};Pooling=False")) {
            await connection.OpenAsync();using var command=connection.CreateCommand();
            command.CommandText="INSERT INTO catalog_volumes_v2 VALUES('a','X:','NTFS',1,'0000000000000001',1,0,0,'ready',150,150,0);";
            await command.ExecuteNonQueryAsync();
            command.CommandText="""
                INSERT INTO catalog_nodes_v2 VALUES('a','0001000000000005','0001000000000005','DSD16','',1,16,1,0,1,3);
                INSERT INTO catalog_nodes_v2 VALUES('a','0001000000000006','0001000000000005','nested','',1,16,1,0,1,3);
                INSERT INTO catalog_directory_paths_v2 VALUES('a','0001000000000005','DSD16'),('a','0001000000000006','DSD16\nested');
                """;
            await command.ExecuteNonQueryAsync();
            for(var i=0;i<150;i++) {
                command.CommandText="INSERT INTO catalog_nodes_v2 VALUES('a',$id,$parent,$name,$ext,0,$attrs,1,10,1,3);";
                command.Parameters.Clear();command.Parameters.AddWithValue("$id",$"{i+16:X16}");
                command.Parameters.AddWithValue("$parent",i<140?"0001000000000005":"0001000000000006");
                command.Parameters.AddWithValue("$name",$"song{i}."+(i<130?"mp3":"txt"));
                command.Parameters.AddWithValue("$ext",i<130?".mp3":".txt");
                command.Parameters.AddWithValue("$attrs",i<10?2:0);await command.ExecuteNonQueryAsync();
            }
        }
        var query=new CatalogV2Query("song",[],CatalogQueryScope.AllVolumes(),null,CatalogEntryType.File,100,null,IncludeTotalCount:true);
        var first=await catalog.QueryAsync(query);
        TestAssert.True(first.Items.Count==100&&first.TotalCount==150&&first.Next is not null,"First page reports all matches beyond page size");
        var next=await catalog.QueryAsync(query with{After=first.Next});
        TestAssert.True(next.Items.Count==50&&next.Next is null&&next.TotalCount is null,"Pagination does not recount or report remaining items as the total");
        var scoped=query with{Scope=CatalogQueryScope.DirectChildren("a","0001000000000005"),Extension=".mp3",ExcludeHidden=true};
        TestAssert.True((await catalog.QueryAsync(scoped)).TotalCount==120,"Count obeys directory, extension and hidden-item conditions");
        TestAssert.True((await catalog.QueryAsync(query with{Query="missing"})).TotalCount==0,"Empty result reports zero");
        TestAssert.True((await catalog.QueryAsync(query with{IncludeTotalCount=false})).TotalCount is null,"Other callers do not pay for counting");
        var folderQuery=query with{Query="DSD16",TextTarget=CatalogQueryTextTarget.NamePathOrKeywords,Scope=CatalogQueryScope.Descendants("a","0001000000000005")};
        var folderPage=await catalog.QueryAsync(folderQuery);
        TestAssert.True(folderPage.TotalCount==150&&folderPage.Items.Count==100&&folderPage.Items.All(item=>!item.IsDirectory&&!item.Name.Contains("DSD16")),"Matching an ancestor folder returns files whose names do not match, excludes folders, and counts files only");
        var folderNext=await catalog.QueryAsync(folderQuery with{After=folderPage.Next});
        TestAssert.True(folderNext.Items.Count==50&&folderNext.Items.All(item=>!item.IsDirectory),"Folder-path matching and file-only results survive pagination");
        Console.WriteLine("Catalog result totals: paging, scope, extension, hidden items, zero and opt-in checks passed.");
    }
}
