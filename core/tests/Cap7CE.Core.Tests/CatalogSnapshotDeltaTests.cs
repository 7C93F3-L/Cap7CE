using System.Diagnostics;
using System.Text.Json;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogSnapshotDeltaTests
{
    private const string Volume="delta-snapshot",Root="0000000000000005";
    private static CatalogV2NodeRecord Directory()=>new(new(Volume,Root),Root,".","",true,16,true,null,10000,20000);
    private static CatalogV2NodeRecord File(int index)=>new(new(Volume,(index+16).ToString("X16")),Root,$"file{index}.png",".png",false,32,true,100+index,10000,20000);
    private static CatalogFileEntryChanges Changes(IEnumerable<CatalogV2NodeRecord> nodes)
    {
        var values=nodes.ToArray();
        return new(values,values.Where(n=>!n.IsDirectory).Select(n=>new CatalogFileEntryUpdate(n.Identity,
            new(n.CreatedUtcTicks,n.ModifiedUtcTicks,n.SizeBytes),[new(Root,n.Name)])).ToArray());
    }
    private static async Task<CatalogV2SnapshotBuildResult> BuildAsync(CatalogV2Database catalog,CatalogV2NodeRecord[] nodes,bool rebuild,long checkpoint,string? alias=null)
    {
        if(rebuild)await catalog.MarkNeedsRebuildAsync(Volume);
        await using var build=await catalog.BeginSnapshotBuildAsync(Volume,"1",checkpoint,0,0,nodes.Length,rebuild,captureFileEntries:true);
        foreach(var page in nodes.Chunk(4096)) {
            var changes=Changes(page);
            if(alias is not null)changes=changes with{Entries=changes.Entries.Select(e=>e.Identity==File(2).Identity?e with{Names=e.Names.Append(new CatalogFileName(Root,alias)).ToArray()}:e).ToArray()};
            await build.AppendWithEntriesAsync(changes);
        }
        return await build.PublishAsync();
    }
    public static async Task ProbeAsync()
    {
        using var fixture=new TemporaryCatalogFixture();var catalog=new CatalogV2Database(fixture.DatabasePath);
        await catalog.InitializeAsync(createEntryCatalog:true);await catalog.RegisterVolumeAsync(Volume,"X:","NTFS",true);
        var nodes=new[]{Directory()}.Concat(Enumerable.Range(0,30000).Select(File)).ToArray();
        var watch=Stopwatch.StartNew();var initial=await BuildAsync(catalog,nodes,false,1);var initialMs=watch.Elapsed.TotalMilliseconds;
        watch.Restart();var repeat=await BuildAsync(catalog,nodes,true,2);
        Console.WriteLine(JsonSerializer.Serialize(new{syntheticRecords=nodes.Length,sourceFilesRead=false,initialMs,repeatMs=watch.Elapsed.TotalMilliseconds,initial=initial.Metrics,repeat=repeat.Metrics}));
        TestAssert.True(await catalog.CheckIntegrityAsync(),"throughput probe leaves its generated Catalog valid");
    }
    public static async Task RunAsync()
    {
        using var fixture=new TemporaryCatalogFixture();var catalog=new CatalogV2Database(fixture.DatabasePath);
        await catalog.InitializeAsync(createEntryCatalog:true);await catalog.RegisterVolumeAsync(Volume,"X:","NTFS",true);
        var nodes=new[]{Directory()}.Concat(Enumerable.Range(0,8).Select(File)).ToArray();await BuildAsync(catalog,nodes,false,1);
        async Task Sql(string sql) {
            await using var c=new SqliteConnection($"Data Source={fixture.DatabasePath};Pooling=False");await c.OpenAsync();
            using var command=c.CreateCommand();command.CommandText=sql;await command.ExecuteNonQueryAsync();
        }
        async Task<long> Scalar(string sql) {
            await using var c=new SqliteConnection($"Data Source={fixture.DatabasePath};Mode=ReadOnly;Pooling=False");await c.OpenAsync();
            using var command=c.CreateCommand();command.CommandText=sql;return Convert.ToInt64(await command.ExecuteScalarAsync());
        }
        await Sql("CREATE TABLE snapshot_mutations(kind TEXT PRIMARY KEY,count INTEGER NOT NULL);INSERT INTO snapshot_mutations VALUES('nodes',0),('paths',0),('sets',0),('entries',0);");
        foreach(var (table,kind) in new[]{("catalog_nodes_v2","nodes"),("catalog_directory_paths_v2","paths"),("catalog_file_entry_sets","sets"),("catalog_file_entries","entries")})
            foreach(var operation in new[]{"INSERT","UPDATE","DELETE"})
                await Sql($"CREATE TRIGGER probe_{kind}_{operation} AFTER {operation} ON {table} BEGIN UPDATE snapshot_mutations SET count=count+1 WHERE kind='{kind}';END;");
        await BuildAsync(catalog,nodes,true,2);
        TestAssert.Equal(0L,await Scalar("SELECT SUM(count) FROM snapshot_mutations"),"unchanged snapshots publish a new checkpoint without rewriting nodes, paths or entry sets");
        TestAssert.Equal(2L,(await catalog.ReadVolumeAsync(Volume))!.CheckpointUsn!.Value,"unchanged publication still advances the checkpoint");
        await BuildAsync(catalog,nodes,true,3,"alias.png");var store=new CatalogFileEntryStore(catalog);
        TestAssert.Equal(2,(await store.ReadAsync(File(2).Identity))!.Entries.Count,"hard-link-only changes update the full name set even when the physical node is unchanged");
        await Sql("INSERT INTO catalog_manual_keywords VALUES('delta-snapshot','0000000000000010','10000','[\"keep\"]','keep',0)");
        nodes=nodes.Where(n=>n.Identity!=File(1).Identity).Select(n=>n.Identity==File(0).Identity?n with{Name="renamed.png",SizeBytes=999}:n).Append(File(50)).ToArray();
        await BuildAsync(catalog,nodes,true,4);
        var renamed=await store.ReadAsync(File(0).Identity);
        TestAssert.Equal("renamed.png",renamed!.Entries.Single().Name,"changed entry names replace old aliases");
        TestAssert.True(await store.ReadAsync(File(1).Identity) is null,"removed files retire their entry sets");
        TestAssert.True(await store.ReadAsync(File(50).Identity) is not null,"new file entries publish normally");
        TestAssert.Equal(1,(await store.ReadAsync(File(2).Identity))!.Entries.Count,"removed aliases do not survive differential publication");
        TestAssert.Equal(999L,await Scalar("SELECT size_bytes FROM catalog_nodes_v2 WHERE name='renamed.png'"),"changed source stamps still update physical nodes");
        TestAssert.Equal(1L,await Scalar("SELECT COUNT(*) FROM catalog_manual_keywords WHERE search_text='keep'"),"manual annotations survive differential publication");
        await Sql("CREATE TRIGGER reject_delta BEFORE UPDATE ON catalog_nodes_v2 WHEN NEW.name='abort.png' BEGIN SELECT RAISE(ABORT,'fixture rejection');END;");
        var rejected=nodes.Select(n=>n.Identity==File(0).Identity?n with{Name="abort.png"}:n).ToArray();
        await TestAssert.ThrowsAsync<SqliteException>(()=>BuildAsync(catalog,rejected,true,5),"failed snapshot publication rolls back its entire transaction");
        TestAssert.Equal("renamed.png",(await store.ReadAsync(File(0).Identity))!.Entries.Single().Name,"failed replacement retains the published entry set");
        TestAssert.True(await catalog.CheckIntegrityAsync(),"differential snapshot publication preserves Catalog integrity");
        Console.WriteLine("Snapshot delta publication passed: unchanged rows untouched, checkpoint advanced, rename/source change, insertion and deletion.");
    }
}
