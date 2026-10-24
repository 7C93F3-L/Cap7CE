namespace Cap7CE.WinUI.Controllers;

// Event-only coordination; the windows retain focus, loading and lifetime ownership.
internal sealed class PreviewSelectionController<T>(Func<T,string> key,Func<T,bool> isFile,Action<T> select,Action<T> follow,Action close)
{
    private object? owner;
    private IReadOnlyList<T>? source;
    private string? current;
    private bool updating;
    public void Open(object context,IReadOnlyList<T> items,T item){owner=context;source=items;current=key(item);}
    public void Detach(){owner=null;source=null;current=null;}
    public void ContextChanged(object? context){if(owner is not null&&!ReferenceEquals(owner,context))Close();}
    public void NavigationStarting(object context,bool preserve){if(ReferenceEquals(owner,context)&&!preserve)Close();}
    private void Close(){Detach();close();}
    public void SelectionChanged(object? context,IReadOnlyList<T> selection)
    {
        if(updating||owner is null||!ReferenceEquals(owner,context)||selection.Count!=1)return;
        var item=selection[0];var path=key(item);
        if(!isFile(item)||StringComparer.OrdinalIgnoreCase.Equals(current,path)||source?.Any(value=>StringComparer.OrdinalIgnoreCase.Equals(key(value),path))!=true)return;
        current=path;updating=true;try{follow(item);}finally{updating=false;}
    }
    public void PreviewChanged(T item)
    {
        if(updating||owner is null)return;
        current=key(item);updating=true;try{select(item);}finally{updating=false;}
    }
}
