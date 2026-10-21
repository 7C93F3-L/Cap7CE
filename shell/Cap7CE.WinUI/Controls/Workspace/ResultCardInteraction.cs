using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.Foundation;

namespace Cap7CE.WinUI.Controls;

// Project existing native selection and pointer states; never choose or navigate an item.
internal sealed class ResultCardInteraction(AssetTile tile)
{
    private Control? owner;
    private DependencyProperty? selectionProperty;
    private long subscription;
    private bool hovered;

    public void Connect()
    {
        Disconnect();
        for(var parent=VisualTreeHelper.GetParent(tile);parent is not null;parent=VisualTreeHelper.GetParent(parent)) {
            if(parent is GridViewItem item){owner=item;selectionProperty=SelectorItem.IsSelectedProperty;break;}
            if(parent is ToggleButton button){owner=button;selectionProperty=ToggleButton.IsCheckedProperty;break;}
        }
        if(owner is null||selectionProperty is null)return;
        subscription=owner.RegisterPropertyChangedCallback(selectionProperty,(_,_)=>Sync());
        owner.AddHandler(UIElement.PointerEnteredEvent,new PointerEventHandler(Enter),true);
        owner.AddHandler(UIElement.PointerExitedEvent,new PointerEventHandler(Exit),true);
        owner.AddHandler(UIElement.PointerCanceledEvent,new PointerEventHandler(Cancel),true);
        Sync();
    }
    public void Disconnect()
    {
        if(owner is not null&&selectionProperty is not null) {
            owner.UnregisterPropertyChangedCallback(selectionProperty,subscription);
            owner.RemoveHandler(UIElement.PointerEnteredEvent,new PointerEventHandler(Enter));
            owner.RemoveHandler(UIElement.PointerExitedEvent,new PointerEventHandler(Exit));
            owner.RemoveHandler(UIElement.PointerCanceledEvent,new PointerEventHandler(Cancel));
        }
        owner=null;selectionProperty=null;hovered=false;tile.SetCardState(false,false);
    }
    private void Sync()=>tile.SetCardState(owner is GridViewItem item?item.IsSelected:owner is ToggleButton {IsChecked:true},hovered);
    private void Enter(object sender,PointerRoutedEventArgs e){hovered=true;Sync();}
    private void Exit(object sender,PointerRoutedEventArgs e)
    {
        if(owner is not null&&new Rect(0,0,owner.ActualWidth,owner.ActualHeight).Contains(e.GetCurrentPoint(owner).Position))return;
        hovered=false;Sync();
    }
    private void Cancel(object sender,PointerRoutedEventArgs e){hovered=false;Sync();}
}
