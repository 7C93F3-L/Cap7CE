using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Cap7CE.Core.Host.CatalogMaintenance;
using Cap7CE.Core.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogChangeImpactTests
{
    public static async Task RunAsync()
    {
        using var fixture=new TemporaryCatalogFixture();var catalog=new CatalogV2Database(fixture.DatabasePath);
        await catalog.InitializeAsync(createEntryCatalog:true);const string volume="impact";
        await catalog.RegisterVolumeAsync(volume,"T:","NTFS",true);
        string Ref(int id)=>id.ToString("X16");
        CatalogV2NodeRecord Node(int id,int parent,string name,bool directory=false)=>new(new(volume,Ref(id)),Ref(parent),name,directory?"":".png",directory,directory?16:32,true,directory?null:10,1,2);
        CatalogFileEntryUpdate Names(CatalogV2NodeRecord node,params CatalogFileName[] names)=>new(node.Identity,new(node.CreatedUtcTicks,node.ModifiedUtcTicks,node.SizeBytes),names);
        var root=Node(5,5,".",true);var a=Node(10,5,"a",true);var b=Node(20,5,"b",true);
        var file=Node(11,10,"one.png");var linked=Node(12,10,"link.png");
        await using(var build=await catalog.BeginSnapshotBuildAsync(volume,"1",1,0,0,5,false,captureFileEntries:true)) {
            await build.AppendWithEntriesAsync(new([root,a,b,file,linked],[Names(file,new CatalogFileName(Ref(10),file.Name)),Names(linked,new CatalogFileName(Ref(10),linked.Name),new CatalogFileName(Ref(20),"alias.png"))]));
            await build.PublishAsync();
        }
        async Task<CatalogDirectoryImpact> Apply(CatalogV2NodeRecord node,CatalogFileEntryUpdate[] names) {
            var current=(await catalog.ReadVolumeAsync(volume))!;CatalogDirectoryImpact? impact=null;
            await catalog.ApplyMaintenanceBatchAsync(new(volume,current.JournalId,current.CheckpointUsn,await catalog.ReadRevisionAsync(),current.CheckpointUsn!.Value+1,0,0,[node],names),impact:value=>impact=value);
            return impact!;
        }
        var changed=file with{ModifiedUtcTicks=3};
        var content=await Apply(changed,[Names(changed,new CatalogFileName(Ref(10),file.Name))]);
        TestAssert.True(content.RelativePaths is ["a\\one.png"],"content updates report only the changed file, not its whole parent or volume");
        var moved=changed with{ParentFileReference=Ref(20),Name="moved.png"};
        var move=await Apply(moved,[Names(moved,new CatalogFileName(Ref(20),moved.Name))]);
        TestAssert.True(move.RelativePaths!.ToHashSet().SetEquals(["a\\one.png","b\\moved.png"]),"rename/move retains both old and new names");
        var deletion=await Apply(linked with{Exists=false},[]);
        TestAssert.True(deletion.RelativePaths!.ToHashSet().SetEquals(["a\\link.png","b\\alias.png"]),"deletion covers every historical hardlink path");
        var renamed=await Apply(a with{Name="renamed"},[]);
        TestAssert.True(renamed.RelativePaths!.ToHashSet().SetEquals(["a","renamed"]),"directory rename reports old and new ancestor ranges");
        var fresh=Node(15,20,"fresh.png");
        TestAssert.True((await Apply(fresh,[Names(fresh,new CatalogFileName(Ref(20),fresh.Name))])).RelativePaths is ["b\\fresh.png"],"new file path is captured after publication");
        var unknown=Node(16,99,"unknown.png");
        TestAssert.True((await Apply(unknown,[Names(unknown,new CatalogFileName(Ref(99),unknown.Name))])).RelativePaths is null,"deferred or unresolved parents fall back to the entire volume");
        var many=Node(17,20,"many.png");
        var aliases=Enumerable.Range(0,257).Select(i=>new CatalogFileName(Ref(20),$"alias-{i}.png")).ToArray();
        TestAssert.True((await Apply(many,[Names(many,aliases)])).RelativePaths is null,"large hardlink sets use bounded whole-volume invalidation");
        await using(var connection=new SqliteConnection("Data Source="+fixture.DatabasePath)) {
            await connection.OpenAsync();using var command=connection.CreateCommand();
            command.CommandText="CREATE TRIGGER impact_failure BEFORE UPDATE ON catalog_nodes_v2 WHEN NEW.name='fail.png' BEGIN SELECT RAISE(ABORT,'injected'); END;";await command.ExecuteNonQueryAsync();
        }
        var before=(await catalog.ReadVolumeAsync(volume))!;var notified=false;
        var failed=moved with{Name="fail.png"};var revision=await catalog.ReadRevisionAsync();
        await TestAssert.ThrowsAsync<SqliteException>(()=>catalog.ApplyMaintenanceBatchAsync(new(volume,before.JournalId,before.CheckpointUsn,revision,before.CheckpointUsn!.Value+1,0,0,[failed],[Names(failed,new CatalogFileName(Ref(20),failed.Name))]),impact:_=>notified=true),"failed publication must roll back before any impact notification");
        TestAssert.False(notified,"uncommitted paths cannot escape the transaction");
        TestAssert.Equal(before.CheckpointUsn,(await catalog.ReadVolumeAsync(volume))!.CheckpointUsn,"failed impact capture preserves the checkpoint");
        await SignalAsync();
    }
    private static async Task SignalAsync()
    {
        var signal=new CatalogChangeSignal();signal.PublishCatalog(10);var start=signal.Snapshot.Sequence;
        signal.PublishScoped(11,new("c",["old\\one.png","new\\one.png"]));
        signal.PublishScoped(12,new("d",["other.png"]));signal.SetState("watching");
        var notice=await signal.WaitAsync(new(start,1),CancellationToken.None,true);
        TestAssert.True(notice.Scopes is {Count:2}&&notice.Scopes.Single(s=>s.VolumeId=="c").RelativePaths!.Count==2,"wait aggregates every publication since the client's sequence");
        var legacy=await signal.WaitAsync(new(start,1),CancellationToken.None);
        TestAssert.Equal(5,CoreProtocolJson.ToElement(legacy).EnumerateObject().Count(),"legacy Electron notice retains exactly five fields");
        signal.PublishCatalog(13);
        TestAssert.True((await signal.WaitAsync(new(start,1),CancellationToken.None,true)).Scopes is null,"global metadata changes preserve conservative invalidation");
        start=signal.Snapshot.Sequence;signal.PublishScoped(15,new("c",["gap.png"]));
        TestAssert.True((await signal.WaitAsync(new(start,1),CancellationToken.None,true)).Scopes is null,"a revision gap cannot imply complete path coverage");
        start=signal.Snapshot.Sequence;
        for(var i=16;i<60;i++)signal.PublishScoped(i,new("c",[i+".png"]));
        TestAssert.True((await signal.WaitAsync(new(start,1),CancellationToken.None,true)).Scopes is null,"overrun history safely falls back without unbounded retention");
        Console.WriteLine("Catalog change impact checks passed: source paths, moves, aliases, deletes, bounded history and legacy wire compatibility.");
    }
}
