using System.Runtime.InteropServices;
using Microsoft.UI.Xaml;
using Windows.Foundation;

namespace Cap7CE.WinUI.Services;

// Read-only screen/client conversion; no input capture or window hooks.
internal static class PreviewPointerPosition
{
    public static Point? Read(nint window,FrameworkElement viewport)
    {
        try {
            if(viewport.XamlRoot is not {} root||!GetCursorPos(out var point)||!ScreenToClient(window,ref point))return null;
            var client=new Point(point.X/root.RasterizationScale,point.Y/root.RasterizationScale);
            return root.Content.TransformToVisual(viewport).TransformPoint(client);
        }catch{return null;}
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct NativePoint {public int X,Y;}
    [DllImport("user32.dll")][return:MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetCursorPos(out NativePoint point);
    [DllImport("user32.dll")][return:MarshalAs(UnmanagedType.Bool)]
    private static extern bool ScreenToClient(nint window,ref NativePoint point);
}
