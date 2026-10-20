using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
namespace Cap7CE.WinUI.Controls;
public sealed class GalleryTile : ToggleButton
{
    private readonly AssetTile tile=new();
    internal Action<GalleryTile>? Pick,Open;
    internal Action<GalleryTile,RightTappedRoutedEventArgs>? Context;
    internal Action<GalleryTile,DragStartingEventArgs>? Drag;
    public GalleryTile()
    {
        Style=(Style)Application.Current.Resources["CapGalleryItem"];Content=tile;CanDrag=true;
        Click+=(_,_)=>Pick?.Invoke(this);DoubleTapped+=(_,e)=>{e.Handled=true;Open?.Invoke(this);};
        RightTapped+=(_,e)=>Context?.Invoke(this,e);DragStarting+=(_,e)=>Drag?.Invoke(this,e);
        DataContextChanged+=(_,_)=>{if(DataContext is AssetItem item)Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(this,item.Name);};
    }
    internal void SetBounds(double width,double height){Width=width;Height=height;tile.SetGalleryBounds(width,height);}
    internal void Suspend(bool value)=>tile.Suspend(value);
}
