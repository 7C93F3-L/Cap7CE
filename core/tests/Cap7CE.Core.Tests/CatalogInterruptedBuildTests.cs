using Cap7CE.Core.Catalog;
using Cap7CE.Core.Host;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogInterruptedBuildTests
{
    public static async Task RunAsync()
    {
        using var fixture=new TemporaryCatalogFixture();var catalog=new CatalogV2Database(fixture.DatabasePath);
        await catalog.InitializeAsync();await catalog.RegisterVolumeAsync("v","X:","NTFS",true);
        var root=new CatalogV2NodeRecord(new("v","0000000000000005"),"0000000000000005",".","",true,16,true,null,1,2);
        var file=new CatalogV2NodeRecord(new("v","000000000000000B"),root.Identity.FileReference,"keep.txt",".txt",false,32,true,10,1,2);
        await using(var initial=await catalog.BeginSnapshotBuildAsync("v","1",1,0,0,2,false)) {
            await initial.AppendAsync([root,file]);await initial.PublishAsync();
        }
        await using(var connection=new SqliteConnection($"Data Source={fixture.DatabasePath};Pooling=False")) {
            await connection.OpenAsync();using var command=connection.CreateCommand();
            command.CommandText="INSERT INTO catalog_manual_keywords VALUES('v','000000000000000B','1','[\"keep\"]','keep',0)";await command.ExecuteNonQueryAsync();
        }
        await catalog.MarkNeedsRebuildAsync("v");
        await using(var abandoned=await catalog.BeginSnapshotBuildAsync("v","1",2,0,0,2,true))await abandoned.AppendAsync([root]);
        TestAssert.Equal(CatalogV2VolumeState.NeedsRebuild,(await catalog.ReadVolumeAsync("v"))!.State,"disposed unpublished snapshot cannot remain building");

        var old=await catalog.BeginBuildAsync("v","1",3,0,0,2,true);
        await catalog.MarkNeedsRebuildAsync("v");
        var current=await catalog.BeginBuildAsync("v","1",4,0,0,2,true);
        TestAssert.False(await catalog.RecoverInterruptedBuildAsync("v",old.CatalogRevision),"old cleanup cannot retire a newer snapshot revision");
        TestAssert.Equal(CatalogV2VolumeState.Building,(await catalog.ReadVolumeAsync("v"))!.State,"newer build stays active");
        var before=await catalog.ReadRevisionAsync();
        await using(var readerOnly=new ProductCoreRuntime(catalog,new NoReader()))await readerOnly.InitializeAsync();
        TestAssert.Equal(before,await catalog.ReadRevisionAsync(),"non-owning runtime cannot repair an active writer's state");
        await using(var owner=new ProductCoreRuntime(catalog,new NoReader(),ownStorage:true)) {
            await Task.WhenAll(owner.InitializeAsync(),owner.InitializeAsync());
            TestAssert.Equal(CatalogV2VolumeState.NeedsRebuild,(await catalog.ReadVolumeAsync("v"))!.State,"exclusive startup retires stale building without connecting a Reader");
            TestAssert.Equal(before+1,await catalog.ReadRevisionAsync(),"startup recovery advances revision exactly once");
            await using var competing=new ProductCoreRuntime(new(fixture.DatabasePath),new NoReader(),ownStorage:true);
            await TestAssert.ThrowsAsync<IOException>(()=>competing.InitializeAsync(),"recovery never bypasses the product storage lease");
        }
        var repaired=await catalog.ReadRevisionAsync();
        TestAssert.False(await catalog.RecoverInterruptedBuildAsync("v",current.CatalogRevision),"repair is idempotent");
        TestAssert.Equal(repaired,await catalog.ReadRevisionAsync(),"no-op repair preserves revision");
        await using(var connection=new SqliteConnection($"Data Source={fixture.DatabasePath};Mode=ReadOnly;Pooling=False")) {
            await connection.OpenAsync();using var command=connection.CreateCommand();
            command.CommandText="SELECT COUNT(*) FROM catalog_nodes_v2";TestAssert.Equal(2L,Convert.ToInt64(await command.ExecuteScalarAsync()),"published source rows survive abandoned staging and startup recovery");
            command.CommandText="SELECT keywords_json FROM catalog_manual_keywords WHERE volume_id='v'";
            TestAssert.Equal("[\"keep\"]",(string)(await command.ExecuteScalarAsync())!,"manual keyword content survives recovery");
        }
        await using(var retry=await catalog.BeginSnapshotBuildAsync("v","1",5,0,0,2,true)) {await retry.AppendAsync([root,file]);await retry.PublishAsync();}
        TestAssert.Equal(CatalogV2VolumeState.Ready,(await catalog.ReadVolumeAsync("v"))!.State,"explicit replacement can complete after recovery");
        Console.WriteLine("Interrupted snapshot recovery passed: disposal, exclusive startup, no Reader, revision fencing, idempotence, preserved rows/keywords and explicit retry.");
    }
    private sealed class NoReader : ICatalogReaderSessionFactory
    {public Task<ICatalogReaderSession> ConnectAsync(CancellationToken token)=>throw new Exception("Recovery must not start Reader or scan source volumes");}
}
