using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Animation;
using Windows.Foundation;

namespace Cap7CE.WinUI.Controls;

// Presentation only: retain the native bars, scroll host and virtualizing panel.
internal sealed class IdleScrollBars
{
    private readonly FrameworkElement host;
    private readonly DispatcherQueueTimer idle;
    private readonly List<ScrollBar> bars=[];
    private readonly Storyboard fade=new();
    private ScrollViewer? scroll;
    private bool nearBar,dragging;

    public static void Attach(FrameworkElement host)=>_ = new IdleScrollBars(host);
    private IdleScrollBars(FrameworkElement host)
    {
        this.host=host;
        idle=host.DispatcherQueue.CreateTimer();idle.IsRepeating=false;idle.Interval=TimeSpan.FromSeconds(1);
        idle.Tick+=(_,_)=>Hide();
        host.Loaded+=(_,_)=>Connect();host.Unloaded+=(_,_)=>Disconnect();
        host.RegisterPropertyChangedCallback(UIElement.VisibilityProperty,(_,_)=>{if(host.Visibility==Visibility.Visible)Connect();else Disconnect();});
    }

    private void Connect()
    {
        if(scroll is not null||!host.IsLoaded||host.Visibility!=Visibility.Visible)return;
        if(host is Control control)control.ApplyTemplate();
        scroll=FindScroll(host);if(scroll is null)return;
        scroll.ApplyTemplate();FindBars(scroll);
        scroll.ViewChanged+=OnViewChanged;
        scroll.AddHandler(UIElement.PointerMovedEvent,new PointerEventHandler(OnPointerMoved),true);
        scroll.AddHandler(UIElement.PointerPressedEvent,new PointerEventHandler(OnPointerPressed),true);
        scroll.AddHandler(UIElement.PointerExitedEvent,new PointerEventHandler(OnPointerExited),true);
        scroll.AddHandler(UIElement.PointerReleasedEvent,new PointerEventHandler(OnPointerReleased),true);
        scroll.AddHandler(UIElement.PointerCanceledEvent,new PointerEventHandler(OnPointerReleased),true);
        foreach(var bar in bars) {
            bar.Scroll+=OnScroll;
            var animation=new DoubleAnimation {From=1,To=0,Duration=new(TimeSpan.FromMilliseconds(160))};
            Storyboard.SetTarget(animation,bar);Storyboard.SetTargetProperty(animation,"Opacity");fade.Children.Add(animation);
            bar.Opacity=0;
        }
    }

    private void Disconnect()
    {
        idle.Stop();fade.Stop();
        if(scroll is not null) {
            scroll.ViewChanged-=OnViewChanged;
            scroll.RemoveHandler(UIElement.PointerMovedEvent,new PointerEventHandler(OnPointerMoved));
            scroll.RemoveHandler(UIElement.PointerPressedEvent,new PointerEventHandler(OnPointerPressed));
            scroll.RemoveHandler(UIElement.PointerExitedEvent,new PointerEventHandler(OnPointerExited));
            scroll.RemoveHandler(UIElement.PointerReleasedEvent,new PointerEventHandler(OnPointerReleased));
            scroll.RemoveHandler(UIElement.PointerCanceledEvent,new PointerEventHandler(OnPointerReleased));
        }
        foreach(var bar in bars){bar.Scroll-=OnScroll;bar.Opacity=1;}
        bars.Clear();fade.Children.Clear();scroll=null;nearBar=dragging=false;
    }

    private void Show()
    {
        if(scroll is null)return;
        idle.Stop();fade.Stop();foreach(var bar in bars)bar.Opacity=1;
        if(!nearBar&&!dragging)idle.Start();
    }
    private void Hide(){if(scroll is not null&&!nearBar&&!dragging){fade.Stop();fade.Begin();}}
    private void OnViewChanged(object? sender,ScrollViewerViewChangedEventArgs e)=>Show();
    private void OnScroll(object sender,ScrollEventArgs e)
    {
        if(e.ScrollEventType==ScrollEventType.ThumbTrack)dragging=true;
        else if(e.ScrollEventType==ScrollEventType.EndScroll)dragging=false;
        Show();
    }
    private void OnPointerMoved(object sender,PointerRoutedEventArgs e)
    {
        if(scroll is null)return;
        var point=e.GetCurrentPoint(scroll).Position;
        var next=IsOverBar(point);
        if(next==nearBar)return;nearBar=next;Show();
    }
    private void OnPointerExited(object sender,PointerRoutedEventArgs e)
    {
        if(scroll is null)return;var point=e.GetCurrentPoint(scroll).Position;
        if(new Rect(0,0,scroll.ActualWidth,scroll.ActualHeight).Contains(point))return;
        nearBar=false;if(!dragging)Show();
    }
    private void OnPointerReleased(object sender,PointerRoutedEventArgs e){if(dragging){dragging=false;Show();}}
    private void OnPointerPressed(object sender,PointerRoutedEventArgs e)
    {if(scroll is not null&&IsOverBar(e.GetCurrentPoint(scroll).Position)){dragging=true;Show();}}
    private bool IsOverBar(Point point)=>scroll is not null&&bars.Any(bar=>bar.Visibility==Visibility.Visible&&bar.ActualWidth>0&&bar.ActualHeight>0&&
        new Rect(bar.TransformToVisual(scroll).TransformPoint(new Point()),new Size(bar.ActualWidth,bar.ActualHeight)).Contains(point));

    private void FindBars(DependencyObject parent)
    {
        for(var i=0;i<VisualTreeHelper.GetChildrenCount(parent);i++) {
            var child=VisualTreeHelper.GetChild(parent,i);
            if(child is ScrollBar bar)bars.Add(bar);
            else if(child is not ScrollViewer&&child is not ScrollContentPresenter)FindBars(child);
        }
    }
    private static ScrollViewer? FindScroll(DependencyObject parent)
    {
        if(parent is ScrollViewer scroll)return scroll;
        for(var i=0;i<VisualTreeHelper.GetChildrenCount(parent);i++)if(FindScroll(VisualTreeHelper.GetChild(parent,i)) is {} found)return found;
        return null;
    }
}
