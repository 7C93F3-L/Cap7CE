using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;

namespace Cap7CE.WinUI.Controls;

// Shared preview chrome; the window owns file navigation and session state.
internal sealed class PreviewNavigationView : Grid
{
    private readonly List<Border> faces=[];
    private readonly List<Button> buttons=[];
    private bool hovered;
    private UIElement? pointerOwner;
    private readonly PointerEventHandler pointerPosition;
    public static SolidColorBrush SurfaceBrush()=>new(Windows.UI.Color.FromArgb(210,32,32,32));
    public PreviewNavigationView(FrameworkElement viewport,Action previous,Action next)
    {
        Background=null;HorizontalAlignment=HorizontalAlignment.Stretch;VerticalAlignment=VerticalAlignment.Stretch;
        pointerPosition=(_,e)=>{
            var point=e.GetCurrentPoint(viewport).Position;
            hovered=point.X>=0&&point.X<=viewport.ActualWidth&&point.Y>=0&&point.Y<viewport.ActualHeight-100
                &&(point.X<56||point.X>viewport.ActualWidth-56);
            UpdateVisibility();
        };
        Children.Add(Side("\uE76B","上一个文件",previous,HorizontalAlignment.Left));
        Children.Add(Side("\uE76C","下一个文件",next,HorizontalAlignment.Right));
        Loaded+=(_,_)=>{
            if(pointerOwner is not null)return;
            pointerOwner=viewport;
            pointerOwner?.AddHandler(PointerMovedEvent,pointerPosition,true);
            pointerOwner?.AddHandler(PointerEnteredEvent,pointerPosition,true);
            pointerOwner?.AddHandler(PointerExitedEvent,pointerPosition,true);
        };
        Unloaded+=(_,_)=>{
            pointerOwner?.RemoveHandler(PointerMovedEvent,pointerPosition);
            pointerOwner?.RemoveHandler(PointerEnteredEvent,pointerPosition);
            pointerOwner?.RemoveHandler(PointerExitedEvent,pointerPosition);
            pointerOwner=null;hovered=false;UpdateVisibility();
        };
    }
    public void Update(bool previous,bool next){buttons[0].IsEnabled=previous;buttons[1].IsEnabled=next;UpdateVisibility();}
    private void UpdateVisibility()
    {
        var visible=hovered||buttons.Any(b=>b.FocusState==FocusState.Keyboard);
        for(var i=0;i<faces.Count;i++) {
            faces[i].Opacity=visible?(buttons[i].IsEnabled?1:.35):0;
            faces[i].IsHitTestVisible=visible&&buttons[i].IsEnabled;
        }
    }
    private FrameworkElement Side(string glyph,string label,Action action,HorizontalAlignment side)
    {
        var button=Ui.Tool(glyph,label,action);button.Width=40;button.Height=40;buttons.Add(button);
        var face=new Border {Child=button,Background=SurfaceBrush(),RequestedTheme=ElementTheme.Dark,CornerRadius=new(12),Opacity=0,IsHitTestVisible=false,
            HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center};faces.Add(face);
        var region=new Grid {Width=56,Background=null,HorizontalAlignment=side,VerticalAlignment=VerticalAlignment.Stretch,Margin=new(0,0,0,100)};
        region.Children.Add(face);
        button.GotFocus+=(_,_)=>UpdateVisibility();button.LostFocus+=(_,_)=>UpdateVisibility();return region;
    }
}
