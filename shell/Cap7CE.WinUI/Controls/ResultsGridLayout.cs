using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;

namespace Cap7CE.WinUI.Controls;

internal sealed class ResultsGridLayout
{
    private readonly GridView grid;
    private bool horizontal;
    private double cell = 138;
    private ScrollViewer? scroll;
    private long viewportSubscription;
    private readonly Style? normalStyle;
    private readonly Style compactStyle = new(typeof(GridViewItem));
    private bool compactStyleApplied,waitingForPanel;
    public ResultsGridLayout(GridView grid)
    {
        this.grid = grid;
        normalStyle = grid.ItemContainerStyle;
        compactStyle.BasedOn=normalStyle;
        compactStyle.Setters.Add(new Setter(FrameworkElement.MinWidthProperty,0d));
        compactStyle.Setters.Add(new Setter(FrameworkElement.MinHeightProperty,0d));
        compactStyle.Setters.Add(new Setter(Control.PaddingProperty,new Thickness(0)));
        compactStyle.Setters.Add(new Setter(FrameworkElement.MarginProperty,new Thickness(0,0,ResultGridGeometry.Gap,0)));
        grid.Loaded += (_, _) => Update();
        grid.Unloaded += (_, _) => {DetachViewport();CancelPanelRefresh();};
        grid.SizeChanged += (_, _) => Update();
        grid.ContainerContentChanging += (_, e) => {
            if (!e.InRecycleQueue) e.RegisterUpdateCallback((_, args) => ApplyTiles(args.ItemContainer));
        };
        grid.AddHandler(UIElement.PointerWheelChangedEvent, new PointerEventHandler(OnWheel), true);
    }

    public void SetHorizontal(bool value) { horizontal = value; Update(); }
    public void Refresh()=>Update();
    private void Update()
    {
        if(grid.IsLoaded&&scroll is null&&FindScroll(grid) is {} found) {
            scroll=found;viewportSubscription=scroll.RegisterPropertyChangedCallback(ScrollViewer.ViewportWidthProperty,(_,_)=>Update());
        }
        if(grid.Visibility!=Visibility.Visible)return;
        ScrollViewer.SetHorizontalScrollMode(grid, horizontal ? ScrollMode.Enabled : ScrollMode.Disabled);
        ScrollViewer.SetVerticalScrollMode(grid, horizontal ? ScrollMode.Disabled : ScrollMode.Enabled);
        ScrollViewer.SetHorizontalScrollBarVisibility(grid, horizontal ? ScrollBarVisibility.Auto : ScrollBarVisibility.Disabled);
        ScrollViewer.SetVerticalScrollBarVisibility(grid, horizontal ? ScrollBarVisibility.Disabled : ScrollBarVisibility.Auto);
        cell = ResultGridGeometry.CompactCell(Math.Max(1,grid.ActualHeight-16),AssetTile.PreferredSize);
        if(compactStyleApplied!=horizontal) { compactStyleApplied=horizontal;grid.ItemContainerStyle=horizontal?compactStyle:normalStyle; }
        if (grid.ItemsPanelRoot is ItemsWrapGrid panel)
        {
            var width=Math.Max(1,(scroll is {ViewportWidth:>0}?scroll.ViewportWidth:grid.ActualWidth)-grid.Padding.Left-grid.Padding.Right);
            var fitted=ResultGridGeometry.FillWidth(width,AssetTile.PreferredSize);
            if(!horizontal)cell=fitted.Cell;
            panel.Orientation = horizontal ? Orientation.Vertical : Orientation.Horizontal;
            panel.MaximumRowsOrColumns = horizontal ? 1 : fitted.Columns;
            panel.ItemWidth = cell+ResultGridGeometry.Gap;
            panel.ItemHeight = horizontal ? cell : cell+28+ResultGridGeometry.Gap;
            panel.VerticalAlignment = horizontal ? VerticalAlignment.Center : VerticalAlignment.Stretch;
        }
        else {WaitForPanel();return;}
        CancelPanelRefresh();ApplyTiles(grid);
    }

    private void ApplyTiles(DependencyObject parent)
    {
        for (var i=0;i<VisualTreeHelper.GetChildrenCount(parent);i++)
        {
            var child=VisualTreeHelper.GetChild(parent,i);
            if(child is AssetTile tile)tile.SetCompactHeight(horizontal?cell:null);else ApplyTiles(child);
        }
    }

    private void WaitForPanel()
    {
        if(waitingForPanel)return;
        waitingForPanel=true;grid.LayoutUpdated+=PanelReady;
    }
    private void PanelReady(object? sender,object args)
    {
        if(grid.Visibility!=Visibility.Visible){CancelPanelRefresh();return;}
        if(grid.ItemsPanelRoot is not ItemsWrapGrid)return;
        CancelPanelRefresh();Update();
    }
    private void CancelPanelRefresh(){if(waitingForPanel)grid.LayoutUpdated-=PanelReady;waitingForPanel=false;}

    private void DetachViewport()
    {
        if(scroll is not null)scroll.UnregisterPropertyChangedCallback(ScrollViewer.ViewportWidthProperty,viewportSubscription);
        scroll=null;
    }

    private void OnWheel(object sender, PointerRoutedEventArgs e)
    {
        if(e.Handled||!horizontal||e.GetCurrentPoint(grid).Properties.IsHorizontalMouseWheel)return;
        if(FindScroll(grid) is not {} scroll)return;
        var delta=e.GetCurrentPoint(grid).Properties.MouseWheelDelta;
        var next=Math.Clamp(scroll.HorizontalOffset-delta,0,scroll.ScrollableWidth);
        if(next==scroll.HorizontalOffset)return;
        scroll.ChangeView(next,null,null,true);e.Handled=true;
    }

    private static ScrollViewer? FindScroll(DependencyObject parent)
    {
        for(var i=0;i<VisualTreeHelper.GetChildrenCount(parent);i++)
        {
            var child=VisualTreeHelper.GetChild(parent,i);
            if(child is ScrollViewer scroll)return scroll;
            if(FindScroll(child) is {} nested)return nested;
        }
        return null;
    }
}
