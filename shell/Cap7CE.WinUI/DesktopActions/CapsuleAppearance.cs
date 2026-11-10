using Cap7CE.WinUI.Themes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.UI;
namespace Cap7CE.WinUI.DesktopActions;
// Presentation only: layered vector finish and local hover/press feedback.
internal sealed class CapsuleAppearance : Grid
{
    private readonly Border shell=new(),shellRim=new(),seat=new(),face=new(),light=new(),rim=new(),sheen=new(),outline=new();
    private readonly Grid core=new(){IsHitTestVisible=false,UseLayoutRounding=false};
    private readonly CapsuleGlowImage hoverGlow=new(),activeGlow=new();
    private readonly ScalarTransition hoverFade=new(){Duration=TimeSpan.FromMilliseconds(180)},activeFade=new(){Duration=TimeSpan.FromMilliseconds(100)};
    private bool hovered,pressed,keyboardFocused,expanded;
    public CapsuleAppearance()
    {
        UseLayoutRounding=false;Background=new SolidColorBrush(Microsoft.UI.Colors.Transparent);
        foreach(var layer in new[]{shell,shellRim,seat}){layer.IsHitTestVisible=false;layer.UseLayoutRounding=false;Children.Add(layer);}Children.Add(core);
        foreach(var layer in new[]{face,light,rim,sheen}){layer.IsHitTestVisible=false;layer.UseLayoutRounding=false;core.Children.Add(layer);}
        core.Children.Add(hoverGlow);core.Children.Add(activeGlow);outline.IsHitTestVisible=false;Children.Add(outline);hoverGlow.OpacityTransition=hoverFade;activeGlow.OpacityTransition=activeFade;
        PointerEntered+=(_,_)=>{hovered=true;Feedback();};PointerExited+=(_,_)=>{hovered=false;Feedback();};
        PointerPressed+=(_,e)=>{if(e.GetCurrentPoint(this).Properties.IsLeftButtonPressed){pressed=true;Feedback();}};
        PointerReleased+=(_,_)=>ResetPress();PointerCanceled+=(_,_)=>ResetPress();PointerCaptureLost+=(_,_)=>ResetPress();
        GotFocus+=(_,_)=>{keyboardFocused=FocusState==FocusState.Keyboard;Feedback();};
        LostFocus+=(_,_)=>{keyboardFocused=false;ResetPress();};
        Unloaded+=(_,_)=>{hovered=pressed=keyboardFocused=expanded=false;Feedback();};
    }
    public void Configure(string color1,string color2,bool vertical,double radius,double scale,double thickness)
    {
        var inset=Math.Round(Math.Clamp(thickness*.09,2.2,3.4)*scale)/scale;var innerRadius=Math.Max(0,radius-inset);
        foreach(var layer in new[]{shell,shellRim,outline})layer.CornerRadius=new(radius);
        foreach(var layer in new[]{face,light,rim,sheen})layer.CornerRadius=new(innerRadius);
        core.Margin=new(inset);seat.Margin=new(inset-.7);seat.CornerRadius=new(innerRadius+.7);seat.Background=new SolidColorBrush(Color.FromArgb(255,12,19,24));
        shell.Background=Gradient(!vertical,(0,Color.FromArgb(255,87,108,121)),(.18,Color.FromArgb(255,57,75,87)),(.48,Color.FromArgb(255,29,41,50)),(.83,Color.FromArgb(255,28,39,48)),(1,Color.FromArgb(255,57,72,83)));
        shellRim.BorderThickness=new(.85/scale);shellRim.BorderBrush=Gradient(!vertical,(0,Color.FromArgb(135,204,223,231)),(.4,Color.FromArgb(35,160,182,193)),(1,Color.FromArgb(65,112,135,148)));
        // Theme color runs along the capsule; the stronger bevel lighting runs across its thickness.
        face.Background=Gradient(vertical,(0,ThemeService.Parse(color1)),(1,ThemeService.Parse(color2)));
        light.Background=Gradient(!vertical,(0,Color.FromArgb(45,0,0,0)),(.2,Color.FromArgb(44,255,255,255)),(.45,Color.FromArgb(0,255,255,255)),(.75,Color.FromArgb(18,0,0,0)),(1,Color.FromArgb(60,0,0,0)));
        outline.BorderThickness=new(.85/scale);outline.BorderBrush=new SolidColorBrush(Color.FromArgb(82,28,32,40));
        rim.BorderThickness=new(.8/scale);
        rim.BorderBrush=Gradient(!vertical,(0,Color.FromArgb(120,0,15,22)),(.4,Color.FromArgb(28,0,15,22)),(1,Color.FromArgb(70,199,232,235)));
        // Broad upper-surface reflection follows the capsule endcaps and fades inward.
        sheen.Background=Gradient(!vertical,(0,Color.FromArgb(0,255,255,255)),(.12,Color.FromArgb(45,255,255,255)),(.4,Color.FromArgb(0,255,255,255)),(1,Color.FromArgb(0,255,255,255)));
        var shortPixels=(int)Math.Round((thickness-2*inset)*scale)-1;var longPixels=(int)Math.Round((3*thickness-2*inset)*scale)-1;
        var width=vertical?shortPixels:longPixels;var height=vertical?longPixels:shortPixels;
        var first=Rgb(ThemeService.Parse(color1));var second=Rgb(ThemeService.Parse(color2));
        hoverGlow.Configure(width,height,first,second,false);activeGlow.Configure(width,height,first,second,true);
    }
    private static LinearGradientBrush Gradient(bool vertical,params (double Offset,Color Color)[] stops)
    {
        var brush=new LinearGradientBrush{StartPoint=new(0,0),EndPoint=vertical?new(0,1):new(1,0)};
        foreach(var stop in stops)brush.GradientStops.Add(new(){Offset=stop.Offset,Color=stop.Color});return brush;
    }
    private static uint Rgb(Color color)=>(uint)(color.R<<16|color.G<<8|color.B);
    private void ResetPress(){pressed=false;Feedback();}
    public void SetExpanded(bool value,bool? pointerInside=null){expanded=value;if(pointerInside is {} inside)hovered=inside;Feedback();}
    private void Feedback()
    {
        var active=pressed||expanded;var over=hovered||keyboardFocused;
        hoverFade.Duration=TimeSpan.FromMilliseconds(active?100:over?180:220);activeFade.Duration=TimeSpan.FromMilliseconds(active?100:220);
        hoverGlow.Opacity=over&&!active?1:0;activeGlow.Opacity=active?1:0;
    }
}
