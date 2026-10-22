using System.Runtime.InteropServices;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;

namespace Cap7CE.WinUI.Services;

// Initial size only: the mainline settings default is 1100 x 840 logical pixels.
internal static class SettingsWindowGeometry
{
    public static void ApplyInitial(Window window)
    {
        var work=DisplayArea.GetFromWindowId(window.AppWindow.Id,DisplayAreaFallback.Nearest).WorkArea;
        var dpi=GetDpiForWindow(WinRT.Interop.WindowNative.GetWindowHandle(window));
        var scale=dpi==0?1:dpi/96d;
        var width=Math.Clamp((int)Math.Round(1100*scale),1,Math.Max(1,work.Width));
        var height=Math.Clamp((int)Math.Round(840*scale),1,Math.Max(1,work.Height));
        window.AppWindow.MoveAndResize(new(work.X+(work.Width-width)/2,work.Y+(work.Height-height)/2,width,height));
    }
    [DllImport("user32.dll",ExactSpelling=true)]
    private static extern uint GetDpiForWindow(nint window);
}
