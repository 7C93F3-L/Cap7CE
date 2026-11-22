using Cap7CE.WinUI.DesktopActions;
using Cap7CE.WinUI.Models;

internal static class HistoryDeletionChecks
{
    public static async Task RunAsync()
    {
        var root=Path.GetFullPath(Path.Combine(Path.GetTempPath(),"cap7ce-history-delete-tests-"+Guid.NewGuid().ToString("N")));
        var path=Path.Combine(root,"actions.json");
        void Check(bool value,string message){if(!value)throw new Exception(message);}
        DesktopSearch Item(string query,string location,bool favorite=false,string entry="")=>new(query,location,favorite,entry,new BrowseFilter(),false);
        try
        {
            var store=new DesktopActionStore(path);
            var first=Item("adobe",@"D:\Assets");var variant=Item("Adobe",@"d:\assets\");
            var other=Item("adobe",@"E:\Assets");var favorite=Item("adobe",@"D:\Assets",true,@"D:\");
            var nested=Item("adobe",@"D:\Assets",true,@"D:\Assets");
            await store.UpdateAsync(v=>v with{History=[first,variant,other,favorite,nested],Size=40,HistoryCount=10});
            await store.RemoveHistoryAsync([first]);
            Check(store.Current.History.SequenceEqual(new[]{variant,other,favorite,nested}),"capsule deletion removes exactly one captured record, retaining same-term siblings");
            var reload=new DesktopActionStore(path);await reload.LoadAsync();
            Check(reload.Current.History.Length==4&&reload.Current.Size==40&&reload.Current.HistoryCount==10,"single deletion persists without changing options");
            await store.UpdateAsync(v=>v with{History=[first,variant,other,favorite,nested]});
            var group=ScopedSearchHistory.Groups(store.Current,@"D:\Assets",false,"","").Single();
            Check(group.SequenceEqual(new[]{first,variant}),"search-box row groups only case variants in the captured directory scope");
            await store.RemoveHistoryAsync(group);
            Check(store.Current.History.SequenceEqual(new[]{other,favorite,nested}),"removing a displayed group leaves foreign directories and favorites intact");
            var favoriteGroup=ScopedSearchHistory.Groups(store.Current,@"D:\Assets",true,@"d:\","").Single();
            await store.RemoveHistoryAsync(favoriteGroup);
            Check(store.Current.History.SequenceEqual(new[]{other,nested}),"favorite deletion respects its entry scope");
            await store.UpdateAsync(v=>v with{History=[first,other]});
            var newer=first with{Recursive=true};
            await Task.WhenAll(store.RememberAsync(newer),store.RemoveHistoryAsync([first]));
            Check(store.Current.History.Contains(newer)&&store.Current.History.Contains(other),"a stale row cannot delete a newer search that replaced its original record");
            await store.RemoveHistoryAsync([first]);
            Check(store.Current.History.Contains(newer),"repeated stale deletion is harmless");
            var before=store.Current;var events=0;store.Changed+=()=>events++;
            using(var locked=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read))
            {
                try{await store.RemoveHistoryAsync([newer]);throw new Exception("Expected failed atomic replace");}
                catch(Exception error) when(error is IOException or UnauthorizedAccessException){}
            }
            Check(ReferenceEquals(before,store.Current)&&events==0,"failed persistence leaves the visible history and published state unchanged");
            Check(Directory.GetFiles(root).Length==1,"failed deletion cleans its temporary file");
            await store.RemoveHistoryAsync(store.Current.History);
            await reload.LoadAsync();
            Check(reload.Current.History.Length==0&&reload.Current.Size==40,"removing the last entry persists empty history and preserves settings");
            Console.WriteLine("History deletion checks passed: exact row/group scope, same-term siblings, stale/concurrent replacement, persistence failure and final-entry removal.");
        }
        finally{if(Directory.Exists(root))Directory.Delete(root,true);}
    }
}
