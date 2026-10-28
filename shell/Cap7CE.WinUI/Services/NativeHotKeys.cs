using Cap7CE.WinUI.Localization;
using System.Runtime.InteropServices;
using System.ComponentModel;
using Microsoft.UI.Xaml;

namespace Cap7CE.WinUI.Services;

// Fixed mainline bindings for actions that exist in the native shell. No polling or owner-process lookup.
internal sealed class NativeHotKeys : IDisposable
{
    private readonly nint window;
    private readonly Subclass callback;
    private readonly Action<Exception> failure;
    private readonly (uint Key,Action Action)[] actions;
    private bool enabled;
    public NativeHotKeys(Window owner,Action focus,Action restore,Action settings,Action cycle,Action<Exception> failure)
    {
        this.failure=failure;window=WinRT.Interop.WindowNative.GetWindowHandle(owner);
        actions=[(0xC0,focus),(0x32,restore),(0x35,settings),(0x51,cycle)];callback=Process;
        if(!SetWindowSubclass(window,callback,7301,0))throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    public void Configure(bool value)
    {
        if(value==enabled)return;
        if(!value){Unregister();enabled=false;return;}
        for(var i=0;i<actions.Length;i++) {
            if(RegisterHotKey(window,7302+i,0x4001,actions[i].Key))continue;
            Unregister();throw new UiFailure("ui.error.hotkey");
        }
        enabled=true;
    }
    private nint Process(nint hwnd,uint message,nuint wParam,nint lParam,nuint id,nuint data)
    {
        if(message==0x0312&&enabled) {
            var index=(long)wParam-7302;
            if(index>=0&&index<actions.Length){try{actions[index].Action();}catch(Exception error){failure(error);}return 0;}
        }
        return DefSubclassProc(hwnd,message,wParam,lParam);
    }
    private void Unregister(){for(var i=0;i<actions.Length;i++)UnregisterHotKey(window,7302+i);}
    public void Dispose(){Unregister();enabled=false;RemoveWindowSubclass(window,callback,7301);}
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
