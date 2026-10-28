using Cap7CE.WinUI.Controllers;

internal static class PreviewSelectionChecks
{
    private sealed record Item(string Path,bool Folder=false);
    public static void Run()
    {
        void Require(bool value,string message){if(!value)throw new Exception(message);}
        var owner=new object();var other=new object();
        Item a=new("A"),b=new("B"),c=new("C"),folder=new("folder",true);
        var source=new List<Item>{a,folder,b,c};var selected=new List<Item>();var followed=new List<Item>();var closes=0;
        PreviewSelectionController<Item>? link=null;
        link=new(i=>i.Path,i=>!i.Folder,
            item=>{selected.Add(item);link!.SelectionChanged(owner,[item]);},
            item=>{followed.Add(item);link!.PreviewChanged(item);},()=>closes++);
        link.Open(owner,source,a);
        link.SelectionChanged(owner,[b]);
        Require(followed.SequenceEqual([b])&&selected.Count==0,"Main selection follows once without a feedback loop");
        link.PreviewChanged(c);
        Require(selected.SequenceEqual([c])&&followed.Count==1,"Preview navigation selects once without reloading itself");
        link.SelectionChanged(owner,[new("c")]);link.SelectionChanged(owner,[]);link.SelectionChanged(owner,[a,b]);link.SelectionChanged(owner,[folder]);
        link.SelectionChanged(other,[a]);link.SelectionChanged(owner,[new("not-in-results")]);
        Require(followed.Count==1,"Same file, empty/multiple selection, folders, foreign contexts and missing items do not change preview");
        var d=new Item("D");source.Add(d);link.SelectionChanged(owner,[d]);
        Require(followed.Last()==d,"Loaded continuation items participate in the same result source");
        link.NavigationStarting(other,false);link.NavigationStarting(owner,true);link.ContextChanged(owner);
        Require(closes==0,"Other sessions and retained background refreshes cannot close preview");
        link.NavigationStarting(owner,false);link.PreviewChanged(a);link.SelectionChanged(owner,[a]);
        Require(closes==1&&selected.Count==1&&followed.Count==2,"Active navigation detaches before closing and stale events do nothing");
        link.Open(owner,source,a);link.ContextChanged(other);link.ContextChanged(other);
        Require(closes==2,"Replacing the browsing context closes the old preview exactly once");
        link.Open(owner,source,a);link.Detach();link.SelectionChanged(owner,[b]);
        Require(followed.Count==2,"Closed preview stays detached");
        Console.WriteLine("Preview selection checks passed (bidirectional sync, no feedback, multi/empty/folders, context lifetime, loaded pages).");
    }
}
