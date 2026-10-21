using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Foundation;
namespace Cap7CE.WinUI.Controls;
internal sealed class GalleryLayout : VirtualizingLayout
{
    private readonly Dictionary<int,UIElement> realized=[];
    private GalleryGeometry geometry=new([],0);
    private bool dirty=true;
    private double width,target=160;
    public void Update(double size){if(target==size)return;target=size;dirty=true;InvalidateMeasure();}
    public void RatiosChanged(){dirty=true;InvalidateMeasure();}
    public GalleryBox? Box(int index)=>index>=0&&index<geometry.Boxes.Count?geometry.Boxes[index]:null;
    protected override Size MeasureOverride(VirtualizingLayoutContext context,Size availableSize)
    {
        var nextWidth=double.IsFinite(availableSize.Width)?Math.Max(1,availableSize.Width):800;
        if(dirty||width!=nextWidth||geometry.Boxes.Count!=context.ItemCount) {
            dirty=false;width=nextWidth;geometry=GalleryGeometry.Create(context.ItemCount,width,i=>(context.GetItemAt(i) as AssetItem)?.AspectRatio??1,target);
        }
        var viewport=context.RealizationRect;var visible=geometry.Visible(viewport.Top,viewport.Bottom).ToDictionary(box=>box.Index);
        var anchor=context.RecommendedAnchorIndex;if(anchor>=0&&anchor<geometry.Boxes.Count)visible.TryAdd(anchor,geometry.Boxes[anchor]);
        foreach(var old in realized.Keys.Where(i=>!visible.ContainsKey(i)).ToArray()){context.RecycleElement(realized[old]);realized.Remove(old);}
        foreach(var (index,box) in visible) {
            var element=context.GetOrCreateElementAt(index);realized[index]=element;
            if(element is GalleryTile tile)tile.SetBounds(box.Width,box.Height);element.Measure(new(box.Width,box.Height));
        }
        return new(width,geometry.Height);
    }
    protected override Size ArrangeOverride(VirtualizingLayoutContext context,Size finalSize)
    {
        foreach(var (index,element) in realized)if(index<geometry.Boxes.Count){var b=geometry.Boxes[index];element.Arrange(new Rect(b.Left,b.Top,b.Width,b.Height));}return finalSize;
    }
    protected override void OnItemsChangedCore(VirtualizingLayoutContext context,object source,System.Collections.Specialized.NotifyCollectionChangedEventArgs args)
    {foreach(var element in realized.Values.ToArray())context.RecycleElement(element);realized.Clear();dirty=true;InvalidateMeasure();}
    protected override void UninitializeForContextCore(VirtualizingLayoutContext context){realized.Clear();base.UninitializeForContextCore(context);}
}
