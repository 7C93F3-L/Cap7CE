using System.Runtime.InteropServices;
using Microsoft.UI.Xaml;
using Cap7CE.WinUI.Localization;
namespace Cap7CE.WinUI.Services;
// Owns exactly one Shell icon, its HICON and callback subscription; no application actions.
internal sealed class TrayIcon : IDisposable
{
    private const uint Callback=0x8000+77;
    private readonly Window window;
    private readonly nint handle;
    private readonly TrayNative.Subclass callback;
    private readonly uint taskbarCreated=TrayNative.RegisterWindowMessageW("TaskbarCreated");
    private TrayNative.IconData data;
    private bool desired,disposed;
    public bool Registered {get;private set;}
    public event Action? Open,Menu;
    public event Action<Exception>? Failure;
    public TrayIcon(Window window)
    {
        if(taskbarCreated==0)throw new UiFailure("ui.tray.failed");
        this.window=window;handle=WinRT.Interop.WindowNative.GetWindowHandle(window);callback=Process;
        TrayNative.ExtractIconExW(Environment.ProcessPath!,0,out var large,out var small,1);
        if(large!=0)TrayNative.DestroyIcon(large);
        data=new(){Size=(uint)Marshal.SizeOf<TrayNative.IconData>(),Window=handle,Id=1,Flags=0x87,Callback=Callback,Icon=small,Tip=ApplicationIdentity.Name,Info="",InfoTitle="",Version=4};
        if(!TrayNative.SetWindowSubclass(handle,callback,8321,0)){if(small!=0)TrayNative.DestroyIcon(small);throw new UiFailure("ui.tray.failed");}
    }
    public void SetEnabled(bool enabled)
    {
        if(disposed)return;desired=enabled;
        if(!enabled){Remove();return;}if(Registered)return;
        if(data.Icon==0||!TrayNative.Shell_NotifyIconW(0,ref data))throw new UiFailure("ui.tray.failed");
        Registered=true;
        if(!TrayNative.Shell_NotifyIconW(4,ref data)){Remove();throw new UiFailure("ui.tray.failed");}
    }
    private void Remove(){if(Registered)TrayNative.Shell_NotifyIconW(2,ref data);Registered=false;}
    private nint Process(nint hwnd,uint message,nuint wParam,nint lParam,nuint id,nuint state)
    {
        if(!disposed){
            if(message==taskbarCreated){Registered=false;window.DispatcherQueue.TryEnqueue(()=>{if(disposed)return;try{SetEnabled(desired);}catch(Exception error){Failure?.Invoke(error);}});}
            else if(message==Callback){
                var action=(uint)((long)lParam&0xffff);
                if(action is 0x400 or 0x401)window.DispatcherQueue.TryEnqueue(()=>{if(!disposed)Open?.Invoke();});
                else if(action==0x7b)window.DispatcherQueue.TryEnqueue(()=>{if(!disposed)Menu?.Invoke();});
                return 0;
            }
        }
        return TrayNative.DefSubclassProc(hwnd,message,wParam,lParam);
    }
    public void Dispose(){if(disposed)return;disposed=true;Remove();TrayNative.RemoveWindowSubclass(handle,callback,8321);if(data.Icon!=0){TrayNative.DestroyIcon(data.Icon);data.Icon=0;}Open=Menu=null;Failure=null;}
}
