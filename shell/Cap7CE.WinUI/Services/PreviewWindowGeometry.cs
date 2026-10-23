using System.Runtime.InteropServices;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Windows.Graphics;

namespace Cap7CE.WinUI.Services;

internal sealed class PreviewWindowGeometry(Window window,Window owner,FrameworkElement viewport)
{
    private bool first=true;
    public void BeginOpen()
    {
        var app=window.AppWindow;
        var work=DisplayArea.GetFromWindowId(owner.AppWindow.Id,DisplayAreaFallback.Nearest).WorkArea;
        var size=app.Size;
        var width=Math.Min(size.Width,work.Width);var height=Math.Min(size.Height,work.Height);
        app.MoveAndResize(new RectInt32(work.X+(work.Width-width)/2,work.Y+(work.Height-height)/2,width,height));
        first=false;
    }
    public void Apply(double imageWidth,double imageHeight,double horizontalDip=10,double verticalDip=58)
    {
        if(window.AppWindow.Presenter is not OverlappedPresenter {State:OverlappedPresenterState.Restored})return;
        var app=window.AppWindow;
        var work=DisplayArea.GetFromWindowId(first?owner.AppWindow.Id:app.Id,DisplayAreaFallback.Nearest).WorkArea;
        var position=app.Position;var size=app.Size;
        // Preserve native snap arrangements while browsing.
        if(!first&&((Math.Abs(size.Height-work.Height)<20&&size.Width<work.Width-20)
            ||(Math.Abs(size.Width-work.Width)<20&&size.Height<work.Height-20)))return;
        viewport.UpdateLayout();
        var dpi=GetDpiForWindow(WinRT.Interop.WindowNative.GetWindowHandle(window));
        var scale=viewport.XamlRoot?.RasterizationScale??(dpi==0?1:dpi/96d);
        var maxWidth=Math.Max(1,work.Width*.85);var maxHeight=Math.Max(1,work.Height*.85);
        // AppWindow.Size includes the native frame. Measure the actual viewport
        // rather than assuming a titlebar-only outer-to-content difference.
        var horizontal=viewport.ActualWidth>0?Math.Max(10*scale,size.Width-viewport.ActualWidth*scale):horizontalDip*scale;
        var vertical=viewport.ActualHeight>0?Math.Max(10*scale,size.Height-viewport.ActualHeight*scale):verticalDip*scale;
        var ratio=Math.Min(1,Math.Min(Math.Max(1,maxWidth-horizontal)/Math.Max(1,imageWidth),Math.Max(1,maxHeight-vertical)/Math.Max(1,imageHeight)));
        var width=(int)Math.Min(maxWidth,Math.Max(360*scale,imageWidth*ratio+horizontal));
        var height=(int)Math.Min(maxHeight,Math.Max(328*scale,imageHeight*ratio+vertical));
        var centerX=first?work.X+work.Width/2d:position.X+size.Width/2d;
        var centerY=first?work.Y+work.Height/2d:position.Y+size.Height/2d;
        app.MoveAndResize(new RectInt32(Math.Clamp((int)Math.Round(centerX-width/2d),work.X,work.X+work.Width-width),
            Math.Clamp((int)Math.Round(centerY-height/2d),work.Y,work.Y+work.Height-height),width,height));
        first=false;
    }
    [DllImport("user32.dll",ExactSpelling=true)]private static extern uint GetDpiForWindow(nint window);
}
