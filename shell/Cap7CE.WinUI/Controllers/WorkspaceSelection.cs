namespace Cap7CE.WinUI.Controllers;
internal sealed class WorkspaceSelection<T> where T:notnull
{
    private readonly HashSet<T> selected=[];
    private int anchor=-1;
    public bool Contains(T item)=>selected.Contains(item);
    public IReadOnlyList<T> Ordered(IEnumerable<T> source)=>source.Where(selected.Contains).ToArray();
    public void Clear(){selected.Clear();anchor=-1;}
    public void Replace(IEnumerable<T> items){selected.Clear();selected.UnionWith(items);anchor=-1;}
    public void Pick(IReadOnlyList<T> items,int index,bool control,bool shift)
    {
        if(index<0||index>=items.Count)return;
        if(shift&&anchor>=0&&anchor<items.Count){if(!control)selected.Clear();for(var i=Math.Min(anchor,index);i<=Math.Max(anchor,index);i++)selected.Add(items[i]);return;}
        if(!control)selected.Clear();if(!selected.Add(items[index])&&control)selected.Remove(items[index]);anchor=index;
    }
}
