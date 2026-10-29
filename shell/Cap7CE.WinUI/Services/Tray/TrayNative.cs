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
    [DllImport("user32.dll")] internal static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] internal static extern uint GetWindowThreadProcessId(nint window,out uint process);
    // Only the anchor HWND is transparent; the windowed flyout has its own HWND.
    internal static void MakeInvisible(nint window)
    {
        var style=GetWindowLongPtrW(window,-20);Marshal.SetLastPInvokeError(0);
        if(SetWindowLongPtrW(window,-20,style|0x80000)==0&&Marshal.GetLastPInvokeError()!=0)throw new System.ComponentModel.Win32Exception(Marshal.GetLastPInvokeError());
        if(!SetLayeredWindowAttributes(window,0,0,2))throw new System.ComponentModel.Win32Exception(Marshal.GetLastPInvokeError());
    }
    [DllImport("user32.dll",SetLastError=true)] private static extern nint GetWindowLongPtrW(nint window,int index);
    [DllImport("user32.dll",SetLastError=true)] private static extern nint SetWindowLongPtrW(nint window,int index,nint value);
    [DllImport("user32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)] private static extern bool SetLayeredWindowAttributes(nint window,uint color,byte alpha,uint flags);
}
