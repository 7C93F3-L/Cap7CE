using System.Runtime.InteropServices;
namespace Cap7CE.WinUI.DesktopActions;
// DWM client alpha setup and zero-alpha background clearing for the capsule HWND only.
internal static class CapsuleTransparency
{
    public static void Enable(nint handle)
    {
        var margins=new Margins();Marshal.ThrowExceptionForHR(DwmExtendFrameIntoClientArea(handle,ref margins));
        var region=CreateRectRgn(-2,-2,-1,-1);
        if(region==0)throw new System.ComponentModel.Win32Exception();
        try{var blur=new BlurBehind{Flags=3,Enabled=1,Region=region};Marshal.ThrowExceptionForHR(DwmEnableBlurBehindWindow(handle,ref blur));}
        finally{DeleteObject(region);}
        var dc=GetDC(handle);if(dc==0)return;
        try{Clear(handle,dc);}finally{ReleaseDC(handle,dc);}
    }
    public static bool Clear(nint handle,nint dc)=>GetClientRect(handle,out var rect)&&FillRect(dc,ref rect,GetStockObject(4))!=0;
    [StructLayout(LayoutKind.Sequential)] private struct Margins {public int Left,Right,Top,Bottom;public Margins(){Left=Right=Top=Bottom=0;}}
    [StructLayout(LayoutKind.Sequential)] private struct BlurBehind {public uint Flags;public int Enabled;public nint Region;public int Transition;}
    [StructLayout(LayoutKind.Sequential)] private struct Rect {public int Left,Top,Right,Bottom;}
    [DllImport("dwmapi.dll")] private static extern int DwmExtendFrameIntoClientArea(nint handle,ref Margins margins);
    [DllImport("dwmapi.dll")] private static extern int DwmEnableBlurBehindWindow(nint handle,ref BlurBehind blur);
    [DllImport("gdi32.dll")] private static extern nint CreateRectRgn(int left,int top,int right,int bottom);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(nint handle);
    [DllImport("gdi32.dll")] private static extern nint GetStockObject(int item);
    [DllImport("user32.dll")] private static extern nint GetDC(nint handle);
    [DllImport("user32.dll")] private static extern int ReleaseDC(nint handle,nint dc);
    [DllImport("user32.dll")] private static extern bool GetClientRect(nint handle,out Rect bounds);
    [DllImport("user32.dll")] private static extern int FillRect(nint dc,ref Rect bounds,nint brush);
}
