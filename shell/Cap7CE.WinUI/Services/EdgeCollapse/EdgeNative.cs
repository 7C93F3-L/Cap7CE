using System.Runtime.InteropServices;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;
internal static class EdgeNative
{
    [StructLayout(LayoutKind.Sequential)] internal struct Rect
    {
        public int Left,Top,Right,Bottom;
        public readonly EdgeRect Value=>new(Left,Top,Right,Bottom);
        public static Rect From(EdgeRect value)=>new(){Left=value.Left,Top=value.Top,Right=value.Right,Bottom=value.Bottom};
    }
    [StructLayout(LayoutKind.Sequential)] internal struct Point {public int X,Y;}
    [StructLayout(LayoutKind.Sequential)] internal struct MonitorInfo {public uint Size;public Rect Monitor,Work;public uint Flags;}
    [StructLayout(LayoutKind.Sequential)] internal struct AppBarData {public uint Size;public nint Window;public uint Callback,Edge;public Rect Bounds;public nint Param;}
    [StructLayout(LayoutKind.Sequential)] internal struct MouseTrack {public uint Size,Flags;public nint Window;public uint HoverTime;}
    internal delegate nint Subclass(nint hwnd,uint message,nuint wParam,nint lParam,nuint id,nuint data);
    internal delegate bool MonitorCallback(nint monitor,nint hdc,ref Rect rect,nint data);
    [DllImport("shell32.dll")] internal static extern nuint SHAppBarMessage(uint message,ref AppBarData data);
    [DllImport("user32.dll")] internal static extern nint MonitorFromWindow(nint hwnd,uint flags);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool GetMonitorInfoW(nint monitor,ref MonitorInfo info);
    [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool EnumDisplayMonitors(nint hdc,nint clip,MonitorCallback callback,nint data);
    [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool GetWindowRect(nint hwnd,out Rect rect);
    [DllImport("dwmapi.dll")] internal static extern int DwmGetWindowAttribute(nint hwnd,uint attribute,out Rect rect,int size);
    [DllImport("user32.dll")] internal static extern uint GetDpiForWindow(nint hwnd);
    [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] internal static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool IsWindowEnabled(nint hwnd);
    [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] internal static extern nint GetWindowLongPtr(nint hwnd,int index);
    [DllImport("user32.dll",EntryPoint="SetWindowLongPtrW",SetLastError=true)] internal static extern nint SetWindowLongPtr(nint hwnd,int index,nint value);
    [DllImport("user32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool SetWindowPos(nint hwnd,nint after,int x,int y,int width,int height,uint flags);
    [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool TrackMouseEvent(ref MouseTrack track);
    [DllImport("comctl32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool SetWindowSubclass(nint hwnd,Subclass callback,nuint id,nuint data);
    [DllImport("comctl32.dll")] internal static extern nint DefSubclassProc(nint hwnd,uint message,nuint wParam,nint lParam);
    [DllImport("comctl32.dll")] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool RemoveWindowSubclass(nint hwnd,Subclass callback,nuint id);
}
