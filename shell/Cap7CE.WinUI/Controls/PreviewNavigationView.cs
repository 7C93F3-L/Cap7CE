using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Cap7CE.WinUI.Controls;

// Shared preview chrome; the window owns file navigation and session state.
internal sealed class PreviewNavigationView : Grid
{
    private readonly List<Border> faces=[];
    private readonly List<Button> buttons=[];
    private int hovered;
    public static SolidColorBrush SurfaceBrush()=>new(Windows.UI.Color.FromArgb(210,32,32,32));
    public PreviewNavigationView(Action previous,Action next)
    {
        Children.Add(Side("\uE76B","上一个文件",previous,HorizontalAlignment.Left));
        Children.Add(Side("\uE76C","下一个文件",next,HorizontalAlignment.Right));
    }
    public void Update(bool previous,bool next){buttons[0].IsEnabled=previous;buttons[1].IsEnabled=next;}
    private void UpdateVisibility()
    {
        var visible=hovered>0||buttons.Any(b=>b.FocusState==FocusState.Keyboard);
        foreach(var face in faces)face.Opacity=visible?1:0;
    }
    private FrameworkElement Side(string glyph,string label,Action action,HorizontalAlignment side)
    {
        var button=Ui.Tool(glyph,label,action);button.Width=40;button.Height=40;
        button.Background=new SolidColorBrush(Microsoft.UI.Colors.Transparent);buttons.Add(button);
        var face=new Border {Child=button,Background=SurfaceBrush(),RequestedTheme=ElementTheme.Dark,CornerRadius=new(12),Opacity=0,
            HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center};faces.Add(face);
        var region=new Border {Child=face,Width=56,HorizontalAlignment=side,VerticalAlignment=VerticalAlignment.Stretch,
            Background=new SolidColorBrush(Microsoft.UI.Colors.Transparent),Margin=new(0,0,0,100)};
        region.PointerEntered+=(_,_)=>{hovered++;UpdateVisibility();};
        region.PointerExited+=(_,_)=>{hovered=Math.Max(0,hovered-1);UpdateVisibility();};
        button.GotFocus+=(_,_)=>UpdateVisibility();button.LostFocus+=(_,_)=>UpdateVisibility();return region;
    }
}
