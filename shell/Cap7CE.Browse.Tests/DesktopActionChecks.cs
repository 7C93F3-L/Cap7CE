using Cap7CE.WinUI.DesktopActions;
using Cap7CE.WinUI.Models;
internal static class DesktopActionChecks
{
    public static async Task RunAsync()
    {
        var directory=Path.Combine(Path.GetTempPath(),"cap7ce-desktop-tests-"+Guid.NewGuid().ToString("N"));
        var path=Path.Combine(directory,"actions.json");
        void Check(bool value,string message){if(!value)throw new Exception(message);}
        try{
            var store=new DesktopActionStore(path);await store.LoadAsync();
            Check(store.Current.Enabled&&!File.Exists(path),"New desktop settings enable the capsule without creating a file during load");
            Check(store.Current.Vertical,"The default right-edge placement must be vertical");
            Directory.CreateDirectory(directory);await File.WriteAllTextAsync(path,"{\"vertical\":false}");await store.LoadAsync();
            Check(store.Current.Vertical,"Legacy unset coordinates must resolve to the vertical right-edge default");
            await store.UpdateAsync(v=>v with{Enabled=false,X=100,Y=0,Vertical=false});var positioned=new DesktopActionStore(path);await positioned.LoadAsync();
            Check(!positioned.Current.Enabled&&!positioned.Current.Vertical&&positioned.Current.X==100&&positioned.Current.Y==0,"Explicitly hidden and positioned capsules retain the saved visibility and direction");
            await store.ResetCapsuleAsync();
            var first=new DesktopSearch("poster",@"D:\Assets",true,@"D:\",new BrowseFilter{Count=2},true);
            await store.RememberAsync(first);
            await store.RememberAsync(first with{Query="photo"});await store.RememberAsync(first);
            Check(store.Current.History.Length==2&&store.Current.History[0].Query=="poster","Exact query/scope history repeats move to front");
            await store.RememberAsync(first with{Path=@"E:\Assets"});
            Check(store.Current.History.Length==3,"Identical terms in different directories remain separate");
            await Task.WhenAll(store.UpdateAsync(v=>v with{Enabled=true}),store.UpdateAsync(v=>v with{Size=44}));
            var restored=new DesktopActionStore(path);await restored.LoadAsync();
            Check(restored.Current.Enabled&&restored.Current.Size==44,"Concurrent field updates preserve both changes");
            Check(restored.Current.History[1].Filter.Count==2&&restored.Current.History[1].Recursive&&restored.Current.History[1].Favorite,"History round-trip preserves search context");
            var app=new DesktopProgram("Editor",@"D:\Editor.exe");
            await restored.UpdateAsync(v=>v with{X=150,Y=250,Vertical=true,Programs=[app],HistoryCount=10});
            await restored.ResetCapsuleAsync();var reset=new DesktopActionStore(path);await reset.LoadAsync();var defaults=new DesktopActionOptions();
            Check(reset.Current.Size==defaults.Size&&reset.Current.X==defaults.X&&reset.Current.Y==defaults.Y&&reset.Current.Vertical==defaults.Vertical,"Capsule reset persists default size, position and orientation");
            Check(reset.Current.Enabled&&reset.Current.RecordHistory&&reset.Current.HistoryCount==10&&reset.Current.Programs.SequenceEqual(new[]{app})&&reset.Current.History.Length==3,"Capsule reset preserves visibility, programs and history settings/data");
            var registered=new DesktopProgram("Store app",DesktopProgram.AppsPrefix+"Fixture.Package!App"){AppId="Fixture.Package!App"};
            await reset.UpdateAsync(v=>v with{Programs=[app,registered]});var registeredReload=new DesktopActionStore(path);await registeredReload.LoadAsync();
            Check(registeredReload.Current.Programs.SequenceEqual(new[]{app,registered}),"Legacy executables and registered apps persist together without migration");
            await restored.UpdateAsync(v=>v with{RecordHistory=false});await restored.RememberAsync(first with{Query="private"});
            Check(restored.Current.History.All(h=>h.Query!="private"),"Disabled history must not record searches");
            await restored.UpdateAsync(v=>v with{RecordHistory=true,HistoryCount=3});
            for(var i=0;i<55;i++)await restored.RememberAsync(first with{Query="item"+i});
            Check(restored.Current.History.Length==50,"History has a fixed retention bound independent of display count");
            await restored.ClearHistoryAsync();var cleared=new DesktopActionStore(path);await cleared.LoadAsync();
            Check(cleared.Current.History.Length==0&&cleared.Current.Enabled,"Clearing history preserves independent settings");
            var legacy=File.ReadAllText(path).Insert(1,"\"nativeSnap\":false,");await File.WriteAllTextAsync(path,legacy);
            var nativeOnly=new DesktopActionStore(path);await nativeOnly.LoadAsync();
            Check(nativeOnly.Current.Enabled&&nativeOnly.Current.History.Length==0,"Retired placement switch must not alter the remaining settings");
            await nativeOnly.UpdateAsync(v=>v with{Size=40});
            Check(!File.ReadAllText(path).Contains("\"nativeSnap\""),"Retired placement preference must not be written again");
            Check(Directory.GetFiles(directory).Length==1,"Atomic writes leave no temporary files");
            var blocked=new DesktopActionStore(directory);try{await blocked.UpdateAsync(v=>v with{Size=44});throw new Exception("Expected failed write");}catch(Exception e) when(e is IOException or UnauthorizedAccessException){}
            Check(blocked.Current.Size==new DesktopActionOptions().Size,"A failed write must not publish unpersisted settings");
            Console.WriteLine("Desktop actions persistence, bounded history, scope replay data and atomic update checks passed.");
        }finally{if(Directory.Exists(directory))Directory.Delete(directory,true);}
    }
}
