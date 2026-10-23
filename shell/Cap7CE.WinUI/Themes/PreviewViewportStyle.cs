using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Hosting;
using System.Numerics;

namespace Cap7CE.WinUI.Themes;

internal static class PreviewViewportStyle
{
    public const float Radius=8;
    public static void Apply(FrameworkElement target)
    {
        // Native media owns a separate presentation surface: configure its
        // supported corner property as well as the common composition clip.
        if(target is MediaPlayerElement player)player.CornerRadius=new(Radius);
        var visual=ElementCompositionPreview.GetElementVisual(target);
        var shape=visual.Compositor.CreateRoundedRectangleGeometry();shape.CornerRadius=new Vector2(Radius);
        var clip=visual.Compositor.CreateGeometricClip(shape);
        void Update()
        {
            shape.Size=new Vector2((float)target.ActualWidth,(float)target.ActualHeight);
            visual.Clip=clip;
            if(target is MediaPlayerElement media)media.CornerRadius=new(Radius);
        }
        target.Loaded+=(_,_)=>Update();target.SizeChanged+=(_,_)=>Update();Update();
    }
}
