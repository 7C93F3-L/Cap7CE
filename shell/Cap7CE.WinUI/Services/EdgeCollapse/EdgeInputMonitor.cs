using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;

namespace Cap7CE.WinUI.Services;

// Observes input without handling it, replacing capture, or clearing selection.
internal sealed class EdgeInputMonitor : IDisposable
{
    private FrameworkElement root;
    private readonly Action changed;
    private readonly PointerEventHandler pointer;
    private readonly List<RoutedEvent> events;
    private readonly HashSet<Popup> popups=[];
    public EdgeInputMonitor(FrameworkElement element,Action check)
    {
        root=element;changed=check;pointer=(_,_)=>changed();
        events=[UIElement.PointerEnteredEvent,UIElement.PointerMovedEvent,UIElement.PointerExitedEvent,
            UIElement.PointerPressedEvent,UIElement.PointerReleasedEvent,UIElement.PointerCaptureLostEvent,
            UIElement.PointerCanceledEvent,UIElement.PointerWheelChangedEvent];
        foreach(var routed in events)root.AddHandler(routed,pointer,true);
        root.KeyUp+=KeyUp;
    }
    public void Attach(FrameworkElement element)
    {
        if(ReferenceEquals(root,element))return;
        foreach(var routed in events)root.RemoveHandler(routed,pointer);root.KeyUp-=KeyUp;
        root=element;foreach(var routed in events)root.AddHandler(routed,pointer,true);root.KeyUp+=KeyUp;
    }
    public bool HasPopup
    {
        get{
            if(root.XamlRoot is not {} xaml)return false;
            var open=VisualTreeHelper.GetOpenPopupsForXamlRoot(xaml);
            foreach(var popup in open)if(popups.Add(popup))popup.Closed+=PopupClosed;
            return open.Count>0;
        }
    }
    private void KeyUp(object sender,KeyRoutedEventArgs e)=>changed();
    private void PopupClosed(object? sender,object e)
    {if(sender is Popup popup){popup.Closed-=PopupClosed;popups.Remove(popup);}changed();}
    public void Dispose()
    {
        foreach(var routed in events)root.RemoveHandler(routed,pointer);root.KeyUp-=KeyUp;
        foreach(var popup in popups)popup.Closed-=PopupClosed;popups.Clear();
    }
}
