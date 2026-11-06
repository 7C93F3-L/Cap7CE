using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogEmbeddedSearchTests
{
    public static async Task RunAsync()
    {
        using var fixture=new TemporaryCatalogFixture();
        var catalog=new CatalogV2Database(fixture.DatabasePath);await catalog.InitializeAsync();
        // Reopening an existing Catalog adds the sparse projection without rebuilding any paths.
        await catalog.InitializeAsync();
        await using(var connection=new SqliteConnection($"Data Source={fixture.DatabasePath};Pooling=False")) {
            await connection.OpenAsync();using var command=connection.CreateCommand();
            command.CommandText="""
                INSERT INTO catalog_volumes_v2 VALUES('prompt','D:','NTFS',1,'1',1,0,0,'ready',1,1,0);
                INSERT INTO catalog_nodes_v2 VALUES
                ('prompt','0000000000000005','0000000000000005','.','',1,16,1,NULL,1,2),
                ('prompt','0000000000000020','0000000000000005','ComfyUI_00001.png','.png',0,32,1,10,1,2);
                INSERT INTO catalog_directory_paths_v2 VALUES('prompt','0000000000000005','');
                """;
            await command.ExecuteNonQueryAsync();
        }
        var facts=new FileFactDatabase(fixture.DatabasePath);await facts.InitializeAsync();
        var identity=new CatalogEntryIdentity("prompt","0000000000000020");
        async Task Publish(string text) {
            var source=(await facts.CaptureAsync(identity))!;
            await facts.PublishAsync(new(identity,source,FileFactKind.ImageDimensions,3,FileFactState.Indexed,10,10,
                SearchEvidence:[new("visual_content",text)]));
        }
        var query=new CatalogV2Query("红色 DRAGON",[],CatalogQueryScope.AllVolumes(),null,CatalogEntryType.File,100,null)
            {TextTarget=CatalogQueryTextTarget.NamePathOrKeywords,IncludeTotalCount=true};
        await Publish("红色 dragon 100%_sample");
        TestAssert.Equal("红色 dragon 100%_sample",(await facts.ReadCurrentAsync(identity,FileFactKind.ImageDimensions,3))!.SearchEvidence![0].Text,"published evidence survives a store roundtrip");
        var page=await catalog.QueryAsync(query);TestAssert.Equal(1,page.Items.Count,"embedded-only terms survive the global candidate filter");
        TestAssert.Equal(1L,page.TotalCount!.Value,"count includes prompt-only matches");
        TestAssert.Equal(1,(await catalog.QueryAsync(query with {Scope=CatalogQueryScope.Descendants("prompt","0000000000000005")})).Items.Count,"scoped prompt match");
        TestAssert.Equal(0,(await catalog.QueryAsync(query with {TextTarget=CatalogQueryTextTarget.Name})).Items.Count,"name-only mode excludes prompts");
        TestAssert.Equal(1,(await catalog.QueryAsync(query with {Query="100%_sample"})).Items.Count,"wildcard characters remain literal");
        TestAssert.Equal(0,(await catalog.QueryAsync(query with {Query="100x_sample"})).Items.Count,"wildcards are not broadened");
        await facts.InvalidateContentAsync(identity);TestAssert.Equal(0,(await catalog.QueryAsync(query)).Items.Count,"same-size same-time content changes fence prompt evidence");
        await Publish("红色 dragon");await facts.InvalidateVolumeAsync("prompt");
        TestAssert.Equal(0,(await catalog.QueryAsync(query)).Items.Count,"volume rebuild fences prompt evidence");
        await Publish("new landscape");TestAssert.Equal(0,(await catalog.QueryAsync(query)).Items.Count,"new publication replaces old prompts");
        await Publish("红色 dragon");
        var current=(await facts.CaptureAsync(identity))!;
        await facts.PublishAsync(new(identity,current,FileFactKind.ImageDimensions,3,FileFactState.Failed,ErrorCode:"read-failed"));
        TestAssert.Equal(0,(await catalog.QueryAsync(query)).Items.Count,"failed re-extraction clears old evidence");
        Console.WriteLine("Embedded prompt search, candidates, scope, literals and source fences passed.");
    }
}
