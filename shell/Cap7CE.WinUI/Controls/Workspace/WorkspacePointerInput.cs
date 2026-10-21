using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;

namespace Cap7CE.WinUI.Controls;

// Match the mainline dismissal boundary without selecting items or owning history.
internal sealed class WorkspacePointerInput : IDisposable
{
    private readonly UIElement root;
    private readonly Action clear;
    private readonly Action<bool> navigate;
    private static readonly DependencyProperty PreserveProperty=DependencyProperty.RegisterAttached(
        "PreserveSelection",typeof(bool),typeof(WorkspacePointerInput),new PropertyMetadata(false));
    internal static void PreserveSelection(DependencyObject element)=>element.SetValue(PreserveProperty,true);
    internal WorkspacePointerInput(UIElement root,Action clear,Action<bool> navigate)
    {
        this.root=root;this.clear=clear;this.navigate=navigate;
        root.AddHandler(UIElement.PointerPressedEvent,new PointerEventHandler(Pressed),true);
    }
    private void Pressed(object sender,PointerRoutedEventArgs e)
    {
        var buttons=e.GetCurrentPoint(root).Properties;
        if(buttons.IsXButton1Pressed||buttons.IsXButton2Pressed) {
            e.Handled=true;navigate(buttons.IsXButton2Pressed);return;
        }
        if(!buttons.IsLeftButtonPressed)return;
        for(var element=e.OriginalSource as DependencyObject;element is not null;element=VisualTreeHelper.GetParent(element)) {
            if((bool)element.GetValue(PreserveProperty)||element is AssetTile or GalleryTile or ScrollBar or Thumb
                or SelectorItem {DataContext:Models.AssetItem})return;
            if(ReferenceEquals(element,root)){clear();return;}
        }
        // Popup content is a separate tree and retains the current selection.
    }
    public void Dispose()=>root.RemoveHandler(UIElement.PointerPressedEvent,new PointerEventHandler(Pressed));
}
