using Microsoft.UI.Composition;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Media;
namespace Cap7CE.WinUI.DesktopActions;
// A per-window transparent compositor backdrop. No global theme changes or extra package.
internal sealed partial class CapsuleTransparentBackdrop : SystemBackdrop
{
    private Windows.UI.Composition.Compositor? compositor;
    private Windows.UI.Composition.CompositionColorBrush? brush;
    protected override void OnDefaultSystemBackdropConfigurationChanged(ICompositionSupportsSystemBackdrop target,XamlRoot root)
    {
        // This transparent brush has no material controller or theme configuration to update.
        // Do not call the base material callback for this custom composition target.
    }
    protected override void OnTargetConnected(ICompositionSupportsSystemBackdrop target,XamlRoot root)
    {
        base.OnTargetConnected(target,root);
        compositor=new();brush=compositor.CreateColorBrush(Microsoft.UI.Colors.Transparent);target.SystemBackdrop=brush;
    }
    protected override void OnTargetDisconnected(ICompositionSupportsSystemBackdrop target)
    {
        target.SystemBackdrop=null;brush?.Dispose();brush=null;compositor?.Dispose();compositor=null;
        base.OnTargetDisconnected(target);
    }
}
