using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactVisualCompatibilityTests
{
    public static async Task RunAsync()
    {
        using var fixture=new TemporaryCatalogFixture();
        var catalog=new CatalogV2Database(fixture.DatabasePath);await catalog.InitializeAsync();
        var facts=new FileFactDatabase(fixture.DatabasePath);await facts.InitializeAsync();
        await using(var db=new SqliteConnection($"Data Source={fixture.DatabasePath};Pooling=False")) {
            await db.OpenAsync();using var command=db.CreateCommand();command.CommandText="""
                INSERT INTO catalog_volumes_v2 VALUES('visual','E:','NTFS',1,'1',1,0,0,'ready',1,1,0);
                INSERT INTO catalog_nodes_v2 VALUES('visual','0000000000000005','0000000000000005','.','',1,16,1,NULL,1,2);
                INSERT INTO catalog_directory_paths_v2 VALUES('visual','0000000000000005','');
                """;
            for(var i=16;i<24;i++)command.CommandText+=$"INSERT INTO catalog_nodes_v2 VALUES('visual','{i:X16}','0000000000000005','sample{i}.png','.png',0,32,1,10,1,2);";
            await command.ExecuteNonQueryAsync();
        }
        CatalogEntryIdentity Identity(int index)=>new("visual",index.ToString("X16"));
        var metrics=FileFactImageMetrics.Names.ToDictionary(name=>name,_=>0);metrics["brightnessMean"]=5000;
        async Task Publish(int index,int version,FileFactKind kind=FileFactKind.ImageDimensions,bool colors=true) {
            var source=(await facts.CaptureAsync(Identity(index)))!;
            await facts.PublishAsync(new(Identity(index),source,kind,version,FileFactState.Indexed,
                Width:kind==FileFactKind.Audio?null:640,Height:kind==FileFactKind.Audio?null:480,
                DurationMilliseconds:kind is FileFactKind.Video or FileFactKind.Audio?1000:null,
                VisualProperties:kind!=FileFactKind.Audio&&colors?metrics:null,ChannelCount:kind==FileFactKind.Audio?2:null));
        }
        await Publish(16,2);await Publish(17,3);await Publish(18,1);await Publish(19,4);await Publish(20,2);
        await Publish(21,2,FileFactKind.Video);await Publish(22,2,FileFactKind.Audio);await Publish(23,2,colors:false);
        await facts.InvalidateContentAsync(Identity(20));
        var filter=new FileFactQueryFilter(FileFactKind.ImageDimensions,3,MinimumWidth:600);
        var query=new CatalogV2Query("",[],CatalogQueryScope.AllVolumes(),null,CatalogEntryType.File,100,null){Facts=filter,IncludeTotalCount=true};
        var page=await catalog.QueryAsync(query);
        TestAssert.Equal(3,page.Items.Count,"version 3 dimensions accept only current version 2 and 3 facts");
        TestAssert.Equal(3L,page.TotalCount!.Value,"compatible fact counts use the same predicate");
        TestAssert.Equal(3,(await catalog.QueryAsync(query with {Query="sample"})).Items.Count,"name-first search keeps compatibility");
        TestAssert.Equal(3,(await catalog.QueryAsync(query with {Scope=CatalogQueryScope.Descendants("visual","0000000000000005")})).Items.Count,"scoped availability keeps compatibility");
        var colors=filter with {VisualGroups=[new([[new("brightnessMean","<=",10000)]])]};
        TestAssert.Equal(2,(await catalog.QueryAsync(query with {Facts=colors})).Items.Count,"color availability accepts real old metrics without inventing missing colors");
        var video=new FileFactQueryFilter(FileFactKind.Video,3,MinimumDurationMilliseconds:500,VisualGroups:colors.VisualGroups);
        TestAssert.Equal(1,(await catalog.QueryAsync(query with {Facts=video})).Items.Count,"version 2 video metrics and duration remain usable");
        TestAssert.Equal(2,(await catalog.QueryAsync(query with {Facts=filter with {ExtractorVersion=2}})).Items.Count,"explicit version 2 remains exact");
        TestAssert.Equal(1,(await catalog.QueryAsync(query with {Facts=filter with {ExtractorVersion=4}})).Items.Count,"future extractor versions do not inherit compatibility");
        TestAssert.Equal(0,(await catalog.QueryAsync(query with {Facts=new(FileFactKind.Audio,3)})).Items.Count,"unrelated domains remain version-exact");
        TestAssert.True(await facts.ReadCurrentAsync(Identity(16),FileFactKind.ImageDimensions,3) is null,"extraction freshness still requires version 3 to backfill prompts");
        Console.WriteLine("Visual fact v2/v3 compatibility, missing metrics, source fences and strict extraction versions passed.");
    }
}
