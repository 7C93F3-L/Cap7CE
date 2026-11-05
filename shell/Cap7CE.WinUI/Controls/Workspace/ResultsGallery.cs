using Cap7CE.WinUI.Controllers;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Windows.ApplicationModel.DataTransfer;
using Windows.System;
namespace Cap7CE.WinUI.Controls;
internal sealed class ResultsGallery : UserControl
{
    private readonly ItemsRepeater repeater=new();
    private readonly GalleryLayout layout=new();
    private readonly ScrollViewer scroll=new(){VerticalScrollBarVisibility=ScrollBarVisibility.Auto,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled,HorizontalScrollMode=ScrollMode.Disabled,Padding=new(8)};
    private readonly WorkspaceSelection<AssetItem> selection=new();
    private readonly HashSet<AssetItem> observed=[];
    private readonly HashSet<GalleryTile> tiles=[];
    private AssetCollection? items;
    private FileCommands? commands;
    private bool queued,loading,suspended,preserveImages;
    public IReadOnlyList<AssetItem> Selection=>selection.Ordered(items??[]);
    public event Action? SelectionChanged;
    public ResultsGallery()
    {
        repeater.Layout=layout;repeater.ItemTemplate=(DataTemplate)Application.Current.Resources["CapGalleryTileTemplate"];scroll.Content=repeater;Content=scroll;
        IdleScrollBars.Attach(this);
        repeater.ElementPrepared+=(_,e)=>{
            if(e.Element is not GalleryTile tile)return;tiles.Add(tile);tile.Pick=Pick;tile.Open=Open;tile.Context=Context;tile.Drag=Drag;
            tile.DragError=error=>commands?.Run(()=>Task.FromException(error));
            tile.IsChecked=tile.DataContext is AssetItem item&&selection.Contains(item);
            tile.Suspend(suspended,preserveImages);
        };
        repeater.ElementClearing+=(_,e)=>{if(e.Element is GalleryTile tile){tiles.Remove(tile);tile.Pick=tile.Open=null;tile.Context=null;tile.Drag=null;tile.DragError=null;}};
        scroll.ViewChanged+=async(_,_)=>await LoadMore();scroll.SizeChanged+=async(_,_)=>await LoadMore();
        PreviewKeyDown+=NavigateKey;Unloaded+=(_,_)=>Detach();Loaded+=(_,_)=>Observe();
    }
    public void Configure(FileCommands value)=>commands=value;
    public void Bind(AssetCollection value,bool preserveViewport=false)
    {
        if(ReferenceEquals(items,value))return;var offset=preserveViewport?scroll.VerticalOffset:0;
        Detach();items=value;selection.Clear();repeater.ItemsSource=value;Observe();
        DispatcherQueue.TryEnqueue(()=>{if(ReferenceEquals(items,value))scroll.ChangeView(null,offset,null,true);});
    }
    private void Detach(){if(items is not null)items.CollectionChanged-=ItemsChanged;foreach(var item in observed)item.AspectChanged-=RatioChanged;observed.Clear();}
    private void Observe(){if(items is null)return;items.CollectionChanged-=ItemsChanged;items.CollectionChanged+=ItemsChanged;foreach(var item in items)if(observed.Add(item))item.AspectChanged+=RatioChanged;}
    private void ItemsChanged(object? sender,System.Collections.Specialized.NotifyCollectionChangedEventArgs e)
    {
        if(e.Action==System.Collections.Specialized.NotifyCollectionChangedAction.Reset){Detach();Observe();selection.Clear();SyncSelection();return;}
        if(e.OldItems is not null)foreach(AssetItem item in e.OldItems){item.AspectChanged-=RatioChanged;observed.Remove(item);}
        if(e.NewItems is not null)foreach(AssetItem item in e.NewItems)if(observed.Add(item))item.AspectChanged+=RatioChanged;
        if(e.OldItems is not null){selection.Replace(Selection);SyncSelection();}
    }
    private void RatioChanged()
    {
        if(queued)return;queued=true;DispatcherQueue.TryEnqueue(()=>{queued=false;layout.RatiosChanged();});
    }
    public void Size(double value)=>layout.Update(value);
    public void Suspend(bool value,bool preserveImage=false){suspended=value;preserveImages=value&&preserveImage;foreach(var tile in tiles)tile.Suspend(value,preserveImages);}
    public void ReplaceSelection(IEnumerable<AssetItem> value){selection.Replace(value);SyncSelection();}
    public void Clear(){selection.Clear();SyncSelection();}
    public void SelectAll(){selection.Replace(items??[]);SyncSelection();}
    public void SelectSingle(AssetItem item)
    {
        if(items?.Contains(item)!=true)return;
        selection.Pick(items,items.IndexOf(item),false,false);SyncSelection();Reveal(items.IndexOf(item));
    }
    private void SyncSelection(){foreach(var tile in tiles)tile.IsChecked=tile.DataContext is AssetItem item&&selection.Contains(item);SelectionChanged?.Invoke();}
    private static bool Down(VirtualKey key)=>Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(key).HasFlag(Windows.UI.Core.CoreVirtualKeyStates.Down);
    private void Pick(GalleryTile tile)
    {if(items is null||tile.DataContext is not AssetItem item)return;selection.Pick(items,items.IndexOf(item),Down(VirtualKey.Control),Down(VirtualKey.Shift));SyncSelection();}
    private void Open(GalleryTile tile)
    {if(tile.DataContext is AssetItem item&&commands is not null)commands.Run(()=>{commands.Open(item);return Task.CompletedTask;});}
    private void Context(GalleryTile tile,RightTappedRoutedEventArgs e)
    {
        if(tile.DataContext is not AssetItem item||commands is null)return;e.Handled=true;
        if(!selection.Contains(item)){selection.Replace([item]);SyncSelection();}
        commands.Menu(Selection).ShowAt(tile,new Microsoft.UI.Xaml.Controls.Primitives.FlyoutShowOptions{Position=e.GetPosition(tile)});
    }
    private void Drag(GalleryTile tile,DragStartingEventArgs e)
    {
        if(tile.DataContext is not AssetItem item){e.Cancel=true;return;}
        if(!selection.Contains(item)){selection.Replace([item]);SyncSelection();}
        var items=Selection;
        ResultDrag.Prepare(e.Data,items,()=>e.Cancel=true);
        e.AllowedOperations=ResultDrag.AllowedOperations(commands?.CanDelete(items)==true);
    }
    private async Task LoadMore()
    {
        if(loading||Visibility!=Visibility.Visible||items is not {HasMoreItems:true,LoadPage:not null} source||scroll.ScrollableHeight-scroll.VerticalOffset>scroll.ViewportHeight)return;
        loading=true;try{await source.LoadPage();}finally{loading=false;}
    }
    private void NavigateKey(object sender,KeyRoutedEventArgs e)
    {
        if(items is null||items.Count==0||e.Key is not (VirtualKey.Left or VirtualKey.Right or VirtualKey.Up or VirtualKey.Down or VirtualKey.Home or VirtualKey.End))return;
        if(Down(VirtualKey.Menu))return;
        var tile=e.OriginalSource as DependencyObject;while(tile is not null&&tile is not GalleryTile)tile=Microsoft.UI.Xaml.Media.VisualTreeHelper.GetParent(tile);
        var index=tile is GalleryTile {DataContext:AssetItem focused}?items.IndexOf(focused):0;var next=index;
        if(e.Key==VirtualKey.Home)next=0;else if(e.Key==VirtualKey.End)next=items.Count-1;
        else if(e.Key==VirtualKey.Left)next=Math.Max(0,index-1);else if(e.Key==VirtualKey.Right)next=Math.Min(items.Count-1,index+1);
        else if(layout.Box(index) is {} box) {
            var candidates=Enumerable.Range(0,items.Count).Select(i=>layout.Box(i)!.Value).Where(b=>e.Key==VirtualKey.Up?b.Top<box.Top:b.Top>box.Top);
            var best=candidates.OrderBy(b=>Math.Abs(b.Top-box.Top)*10000+Math.Abs(b.Left+b.Width/2-box.Left-box.Width/2)).FirstOrDefault();if(best.Height>0)next=best.Index;
        }
        e.Handled=true;if(!Down(VirtualKey.Control))selection.Pick(items,next,false,Down(VirtualKey.Shift));SyncSelection();
        Reveal(next);
        (repeater.TryGetElement(next) as Control)?.Focus(FocusState.Keyboard);
    }
    private void Reveal(int index)
    {
        if(layout.Box(index) is {} target) {
            var offset=GalleryGeometry.RevealOffset(target,scroll.VerticalOffset,scroll.ViewportHeight,scroll.ScrollableHeight);
            if(Math.Abs(offset-scroll.VerticalOffset)>.5){scroll.ChangeView(null,offset,null,true);repeater.UpdateLayout();}
        }
    }
}
