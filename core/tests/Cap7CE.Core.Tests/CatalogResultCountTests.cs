using Cap7CE.Core.Catalog;
using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;
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
        await using var runtime=new ProductCoreRuntime(catalog,new SyntheticCatalogReader());
        var dispatcher=new CoreRequestDispatcher(runtime,new ProductSearchCursorCodec());var sequence=0;
        async Task<CoreResponseEnvelope> Send(string operation,object body)=>await dispatcher.DispatchAsync(
            new(1,"live-count-"+(++sequence),operation,5000,CoreProtocolJson.ToElement(body)),CancellationToken.None);
        foreach(var sort in new[]{CoreSearchSorts.NameAscending,CoreSearchSorts.NameDescending,CoreSearchSorts.ModifiedAscending,CoreSearchSorts.ModifiedDescending}) {
            var request=new SearchStartRequest("song",100,sort,["a"],EntryType:"file",IncludeTotalCount:true);
            var strict=ProtocolClient.ReadBody<SearchPageResponse>(await Send(CoreOperations.SearchStart,request));
            var live=ProtocolClient.ReadBody<SearchPageResponse>(await Send(CoreOperations.SearchStart,request with{Continuation="live"}));
            await catalog.SetVolumeSelectionAsync(["a"]);
            var stale=await Send(CoreOperations.SearchNextPage,new SearchNextPageRequest(strict.NextCursor!));
            TestAssert.True(stale.Error?.Code==CoreErrorCodes.InvalidCursor,"Reproduce strict paging failure after background revision changes");
            var continued=ProtocolClient.ReadBody<SearchPageResponse>(await Send(CoreOperations.SearchNextPage,new SearchNextPageRequest(live.NextCursor!)));
            TestAssert.True(live.TotalCount==150&&continued.Items.Count==50&&continued.NextCursor is null&&continued.CatalogRevision>live.CatalogRevision,"Live paging retains totals and continues across background updates in all four sorts");
            TestAssert.True(live.Items.Concat(continued.Items).Select(item=>item.Id).Distinct().Count()==150,"Unchanged files stay complete and unique across a revision change");
        }
        Console.WriteLine("Catalog totals and live paging passed (scope, filters, folders, zero, opt-in, four sorts, background revisions and strict-cursor regression).");
    }
}
