using System.Runtime.InteropServices;
namespace Cap7CE.WinUI.Services;
internal static class TrayNative
{
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] internal struct IconData
    {
        public uint Size;public nint Window;public uint Id,Flags,Callback;public nint Icon;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)] public string Tip;
        public uint State,StateMask;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=256)] public string Info;
        public uint Version;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=64)] public string InfoTitle;
        public uint InfoFlags;public Guid Guid;public nint Balloon;
    }
    [StructLayout(LayoutKind.Sequential)] internal struct Point {public int X,Y;}
    internal delegate nint Subclass(nint hwnd,uint message,nuint wParam,nint lParam,nuint id,nuint data);
    [DllImport("shell32.dll",CharSet=CharSet.Unicode)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool Shell_NotifyIconW(uint operation,ref IconData data);
    [DllImport("shell32.dll",CharSet=CharSet.Unicode)] internal static extern uint ExtractIconExW(string file,int index,out nint large,out nint small,uint count);
    [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool DestroyIcon(nint icon);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] internal static extern uint RegisterWindowMessageW(string name);
    [DllImport("comctl32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool SetWindowSubclass(nint hwnd,Subclass callback,nuint id,nuint data);
    [DllImport("comctl32.dll")] internal static extern nint DefSubclassProc(nint hwnd,uint message,nuint wParam,nint lParam);
    [DllImport("comctl32.dll")] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool RemoveWindowSubclass(nint hwnd,Subclass callback,nuint id);
    [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool SetForegroundWindow(nint window);
    [DllImport("user32.dll",SetLastError=true)] internal static extern nint CreatePopupMenu();
    [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool AppendMenuW(nint menu,uint flags,nuint id,string? text);
    [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool CheckMenuRadioItem(nint menu,uint first,uint last,uint selected,uint flags);
    [DllImport("user32.dll")] internal static extern uint TrackPopupMenuEx(nint menu,uint flags,int x,int y,nint owner,nint parameters);
    [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool DestroyMenu(nint menu);
    [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] internal static extern nint CreateWindowExW(uint extendedStyle,string className,string title,uint style,int x,int y,int width,int height,nint parent,nint menu,nint instance,nint parameter);
    [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool DestroyWindow(nint window);
    [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool ShowWindow(nint window,int command);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] [return:MarshalAs(UnmanagedType.Bool)] internal static extern bool PostMessageW(nint window,uint message,nuint wParam,nint lParam);
}