using Cap7CE.WinUI.Localization;
using System.Runtime.InteropServices;
using System.ComponentModel;
using Microsoft.UI.Xaml;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;

// Current HWND only. Local accelerators and preference ownership live outside this adapter.
internal sealed class NativeHotKeys : IDisposable
{
    private readonly nint window;
    private readonly Subclass callback;
    private readonly Action<Exception> failure;
    private readonly Action<string> execute;
    public GlobalShortcutRegistrations Registrations {get;}
    public NativeHotKeys(Window owner,Action<string> execute,Action<Exception> failure)
    {
        this.failure=failure;window=WinRT.Interop.WindowNative.GetWindowHandle(owner);
        this.execute=execute;callback=Process;
        Registrations=new((id,gesture)=>RegisterHotKey(window,id,0x4000|gesture.Modifiers,gesture.Key),id=>UnregisterHotKey(window,id));
        if(!SetWindowSubclass(window,callback,7301,0))throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    private nint Process(nint hwnd,uint message,nuint wParam,nint lParam,nuint id,nuint data)
    {
        if(message==0x0312&&Registrations.Action((int)wParam) is {} action) {
            try{execute(action);}catch(Exception error){failure(error);}return 0;
        }
        return DefSubclassProc(hwnd,message,wParam,lParam);
    }
    public void Dispose(){Registrations.Clear();RemoveWindowSubclass(window,callback,7301);}
    private delegate nint Subclass(nint hwnd,uint message,nuint wParam,nint lParam,nuint id,nuint data);
    [DllImport("comctl32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowSubclass(nint hwnd,Subclass proc,nuint id,nuint data);
    [DllImport("comctl32.dll")] [return:MarshalAs(UnmanagedType.Bool)]
    private static extern bool RemoveWindowSubclass(nint hwnd,Subclass proc,nuint id);
    [DllImport("comctl32.dll")] private static extern nint DefSubclassProc(nint hwnd,uint msg,nuint wParam,nint lParam);
    [DllImport("user32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]
    private static extern bool RegisterHotKey(nint hwnd,int id,uint modifiers,uint key);
    [DllImport("user32.dll")] [return:MarshalAs(UnmanagedType.Bool)] private static extern bool UnregisterHotKey(nint hwnd,int id);
}
