using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using System.Runtime.CompilerServices;

namespace Cap7CE.WinUI.Controls;

// Project existing native selection and pointer states; never choose or navigate an item.
internal sealed class ResultCardInteraction(AssetTile tile)
{
    private Control? owner;
    private DependencyProperty? selectionProperty;
    private long subscription;
    private bool hovered;
    private UIElement? pointerRoot;
    private static readonly ConditionalWeakTable<XamlRoot, HoverOwner> hoverOwners=new();
    private sealed class HoverOwner { public ResultCardInteraction? Current; }
    private HoverOwner? hoverOwner;

    public void Connect()
    {
        Disconnect();
        for(var parent=VisualTreeHelper.GetParent(tile);parent is not null;parent=VisualTreeHelper.GetParent(parent)) {
            if(parent is GridViewItem item){owner=item;selectionProperty=SelectorItem.IsSelectedProperty;break;}
            if(parent is ToggleButton button){owner=button;selectionProperty=ToggleButton.IsCheckedProperty;break;}
        }
        if(owner is null||selectionProperty is null)return;
        if(tile.XamlRoot is {} root)hoverOwner=hoverOwners.GetValue(root,_=>new());
        subscription=owner.RegisterPropertyChangedCallback(selectionProperty,(_,_)=>Sync());
        owner.AddHandler(UIElement.PointerEnteredEvent,new PointerEventHandler(Enter),true);
        owner.AddHandler(UIElement.PointerExitedEvent,new PointerEventHandler(Exit),true);
        owner.AddHandler(UIElement.PointerCanceledEvent,new PointerEventHandler(Cancel),true);
        owner.AddHandler(UIElement.PointerCaptureLostEvent,new PointerEventHandler(Cancel),true);
        Sync();
    }
    public void Disconnect()
    {
        ClearHover();
        if(owner is not null&&selectionProperty is not null) {
            owner.UnregisterPropertyChangedCallback(selectionProperty,subscription);
            owner.RemoveHandler(UIElement.PointerEnteredEvent,new PointerEventHandler(Enter));
            owner.RemoveHandler(UIElement.PointerExitedEvent,new PointerEventHandler(Exit));
            owner.RemoveHandler(UIElement.PointerCanceledEvent,new PointerEventHandler(Cancel));
            owner.RemoveHandler(UIElement.PointerCaptureLostEvent,new PointerEventHandler(Cancel));
        }
        owner=null;selectionProperty=null;hoverOwner=null;tile.SetCardState(false,false);
    }
    private void Sync()=>tile.SetCardState(owner is GridViewItem item?item.IsSelected:owner is ToggleButton {IsChecked:true},hovered);
    private void Enter(object sender,PointerRoutedEventArgs e)
    {
        if(e.Pointer.PointerDeviceType!=Microsoft.UI.Input.PointerDeviceType.Mouse||hovered)return;
        hoverOwner?.Current?.ClearHover();
        hovered=true;if(hoverOwner is not null)hoverOwner.Current=this;
        pointerRoot=tile.XamlRoot?.Content;
        pointerRoot?.AddHandler(UIElement.PointerMovedEvent,new PointerEventHandler(Exit),true);
        pointerRoot?.AddHandler(UIElement.PointerExitedEvent,new PointerEventHandler(Exit),true);
        Sync();
    }
    private void Exit(object sender,PointerRoutedEventArgs e)
    {
        if(owner is not null) {
            var point=e.GetCurrentPoint(owner).Position;
            if(point.X>=0&&point.Y>=0&&point.X<owner.ActualWidth&&point.Y<owner.ActualHeight)return;
        }
        ClearHover();
    }
    internal void ClearHover()
    {
        pointerRoot?.RemoveHandler(UIElement.PointerMovedEvent,new PointerEventHandler(Exit));
        pointerRoot?.RemoveHandler(UIElement.PointerExitedEvent,new PointerEventHandler(Exit));
        pointerRoot=null;
        if(hoverOwner?.Current==this)hoverOwner.Current=null;
        if(!hovered)return;
        hovered=false;Sync();
    }
    private void Cancel(object sender,PointerRoutedEventArgs e)=>ClearHover();
}
