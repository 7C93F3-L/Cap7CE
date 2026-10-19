using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogJournalEntryParentTests
{
    public static async Task RunAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        var catalog = new CatalogV2Database(fixture.DatabasePath);await catalog.InitializeAsync(createEntryCatalog: true);
        const string volume = "journal-parent";await catalog.RegisterVolumeAsync(volume, "J:", "NTFS", true);
        CatalogV2NodeRecord Node(ulong id, ulong parent, string name, bool directory = false) =>
            new(new(volume, Ref(id)), Ref(parent), name, directory ? "" : ".png", directory, directory ? 16 : 32, true, directory ? null : 10, 1, 2);
        var root=Node(5,5,".",true);var file=Node(11,5,"old.png");var healthy=Node(12,5,"healthy.png");var fresh=Node(13,5,"fresh.png");var missing=Node(99,5,"late",true);
        await using(var build=await catalog.BeginSnapshotBuildAsync(volume,"1",1,0,0,3,false,captureFileEntries:true)) {
            await build.AppendWithEntriesAsync(new([root,file,healthy],[Names(file,new CatalogFileName(Ref(5),file.Name)),Names(healthy,new CatalogFileName(Ref(5),healthy.Name))]));await build.PublishAsync();
        }
        var facts=new FileFactDatabase(fixture.DatabasePath);await facts.InitializeAsync();var oldSource=(await facts.CaptureAsync(file.Identity))!;
        var changed=file with {Name="new.png",InvalidatesFileFacts=true,MayChangeFileFormat=true};var healthyChanged=healthy with{Name="healthy-new.png"};
        var updates=new[]{Names(changed,new CatalogFileName(Ref(5),changed.Name),new CatalogFileName(Ref(99),"late.png")),Names(healthyChanged,new CatalogFileName(Ref(5),healthyChanged.Name)),Names(fresh,new CatalogFileName(Ref(5),fresh.Name),new CatalogFileName(Ref(99),"fresh-alias.png"))};
        await Apply([changed,changed with{InvalidatesFileFacts=false,MayChangeFileFormat=false},healthyChanged,fresh],updates);
        var store=new CatalogFileEntryStore(catalog);var pending=new CatalogFileEntryPending(catalog);
        TestAssert.Equal("old.png",(await store.ReadAsync(file.Identity))!.Entries.Single().Name,"journal parent gap keeps the old complete name set");
        TestAssert.True(await store.ReadAsync(fresh.Identity) is null,"journal parent gap cannot publish one of a fresh identity's aliases");
        TestAssert.Equal("healthy-new.png",(await store.ReadAsync(healthy.Identity))!.Entries.Single().Name,"independent journal identities still advance");
        TestAssert.Equal(2L,(await pending.ReadDueAsync(volume,0)).Waiting,"incomplete identities become durable retry work");
        TestAssert.True(await facts.CaptureAsync(file.Identity) is null,"unknown entry parents cannot authorize source content");
        await Apply([missing],[]);
        await Apply([changed with{InvalidatesFileFacts=false,MayChangeFileFormat=false},fresh],[updates[0],updates[2]]);
        TestAssert.Equal(2,(await store.ReadAsync(file.Identity))!.Entries.Count,"later parent coverage publishes every name");
        TestAssert.Equal(0L,(await pending.ReadDueAsync(volume,0)).Waiting,"confirmed complete sets consume pending work");
        TestAssert.True((await facts.CaptureAsync(file.Identity))!.ContentRevision>oldSource.ContentRevision,"deferred content invalidation survives a later metadata-only replay");
        var sameParent=Node(100,5,"same-page",true);var sameFile=Node(14,100,"same.png");
        await Apply([sameFile,sameParent],[Names(sameFile,new CatalogFileName(Ref(100),sameFile.Name))]);
        TestAssert.True(await store.ReadAsync(sameFile.Identity) is not null,"parent arriving in the same page is usable regardless of row order");
        await Apply([sameParent with{Exists=false},sameFile],[Names(sameFile,new CatalogFileName(Ref(100),sameFile.Name))]);
        TestAssert.Equal(1L,(await pending.ReadDueAsync(volume,0)).Waiting,"parent deleted in the same page defers the whole child");
        await Apply([sameParent,sameFile],[Names(sameFile,new CatalogFileName(Ref(100),sameFile.Name))]);
        TestAssert.Equal(0L,(await pending.ReadDueAsync(volume,0)).Waiting,"restored parent permits the complete child publication");
        var formatBefore=(await facts.CaptureAsync(healthy.Identity))!;
        var format=healthyChanged with{Name="healthy.wav",Extension=".wav",MayChangeFileFormat=true};
        var formatNames=Names(format,new CatalogFileName(Ref(102),format.Name));
        await Apply([format],[formatNames]);
        await Apply([Node(102,5,"format-parent",true),format with{MayChangeFileFormat=false}],[formatNames]);
        TestAssert.True((await facts.CaptureAsync(healthy.Identity))!.ContentRevision>formatBefore.ContentRevision,"format-only invalidation survives parent deferral independently of content changes");
        var before=(await catalog.ReadVolumeAsync(volume))!;
        await using(var connection=new SqliteConnection(new SqliteConnectionStringBuilder{DataSource=fixture.DatabasePath}.ToString())) {
            await connection.OpenAsync();using var command=connection.CreateCommand();command.CommandText="CREATE TRIGGER fail_parent_defer BEFORE INSERT ON catalog_file_entry_pending BEGIN SELECT RAISE(ABORT,'injected'); END;";await command.ExecuteNonQueryAsync();
        }
        await TestAssert.ThrowsAsync<SqliteException>(()=>Apply([changed,healthyChanged with{Name="rollback.png"}],[Names(changed,new CatalogFileName(Ref(101),"unknown.png")),Names(healthyChanged,new CatalogFileName(Ref(5),healthyChanged.Name))]),"pending failure rolls back the entire journal publication");
        TestAssert.Equal(before.CheckpointUsn,(await catalog.ReadVolumeAsync(volume))!.CheckpointUsn,"failed deferral cannot advance the checkpoint");
        TestAssert.Equal(2,(await store.ReadAsync(file.Identity))!.Entries.Count,"failed deferral retains the complete old set");
        TestAssert.Equal(0L,(await pending.ReadDueAsync(volume,0)).Waiting,"failed transaction cannot leak pending work");
        TestAssert.True(await catalog.CheckIntegrityAsync(),"journal parent recovery keeps SQLite integrity");
        Console.WriteLine("Journal entry parents: whole-identity deferral, old aliases preserved, healthy siblings, source authorization fence, later recovery, retained invalidation and atomic failure rollback passed.");
        async Task Apply(IReadOnlyList<CatalogV2NodeRecord> nodes,IReadOnlyList<CatalogFileEntryUpdate> entries) {
            var current=(await catalog.ReadVolumeAsync(volume))!;await catalog.ApplyMaintenanceBatchAsync(new(volume,current.JournalId,current.CheckpointUsn,await catalog.ReadRevisionAsync(),current.CheckpointUsn!.Value+1,current.JournalFirstUsn,current.JournalLowestValidUsn,nodes,entries));
        }
    }
    private static string Ref(ulong value)=>value.ToString("X16");
    private static CatalogFileEntryUpdate Names(CatalogV2NodeRecord node,params CatalogFileName[] names)=>new(node.Identity,new(node.CreatedUtcTicks,node.ModifiedUtcTicks,node.SizeBytes),names);
}
