using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Input;
using Windows.Foundation;
namespace Cap7CE.WinUI.Controls;
public sealed class GalleryTile : ToggleButton
{
    private readonly AssetTile tile=new();
    internal Action<GalleryTile>? Pick,Open;
    internal Action<GalleryTile,RightTappedRoutedEventArgs>? Context;
    internal Action<GalleryTile,DragStartingEventArgs>? Drag;
    internal Action<Exception>? DragError;
    private Point pressed;
    private uint pointerId;
    private bool armed,dragging;
    public GalleryTile()
    {
        Style=(Style)Application.Current.Resources["CapGalleryItem"];Content=tile;
        Click+=(_,_)=>{if(!dragging)Pick?.Invoke(this);};DoubleTapped+=(_,e)=>{e.Handled=true;Open?.Invoke(this);};
        RightTapped+=(_,e)=>Context?.Invoke(this,e);DragStarting+=(_,e)=>Drag?.Invoke(this,e);
        PointerReleased+=(_,_)=>armed=false;PointerCanceled+=(_,_)=>armed=false;
        PointerCaptureLost+=(_,_)=>armed=false;Unloaded+=(_,_)=>armed=false;
        DataContextChanged+=(_,_)=>{if(DataContext is AssetItem item)Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(this,item.Name);};
    }
    protected override void OnToggle(){if(!dragging)base.OnToggle();}
    protected override void OnPointerPressed(PointerRoutedEventArgs e)
    {
        base.OnPointerPressed(e);
        var point=e.GetCurrentPoint(this);
        armed=e.Pointer.PointerDeviceType==PointerDeviceType.Mouse&&point.Properties.IsLeftButtonPressed&&!dragging;
        if(armed){pressed=point.Position;pointerId=e.Pointer.PointerId;}
    }
    protected override async void OnPointerMoved(PointerRoutedEventArgs e)
    {
        base.OnPointerMoved(e);
        if(!armed||dragging||e.Pointer.PointerId!=pointerId)return;
        var point=e.GetCurrentPoint(this);
        if(!point.Properties.IsLeftButtonPressed){armed=false;return;}
        if(Math.Abs(point.Position.X-pressed.X)<4&&Math.Abs(point.Position.Y-pressed.Y)<4)return;
        armed=false;dragging=true;e.Handled=true;ResultDrag.SetActive(this,true);
        try {await StartDragAsync(point);}
        catch(Exception error){DragError?.Invoke(error);}
        finally {dragging=false;ResultDrag.SetActive(this,false);}
    }
    internal void SetBounds(double width,double height){if(Width==width&&Height==height)return;Width=width;Height=height;tile.SetGalleryBounds(width,height);}
    internal void Suspend(bool value)=>tile.Suspend(value);
}
