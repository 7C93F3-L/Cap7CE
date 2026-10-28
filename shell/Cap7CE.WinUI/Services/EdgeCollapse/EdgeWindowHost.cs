using System.ComponentModel;
using System.Runtime.InteropServices;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;

namespace Cap7CE.WinUI.Services;

// Native window/frame boundary. It does not own input scheduling, data or views.
internal sealed class EdgeWindowHost : IDisposable
{
    private readonly Window window;
    private readonly EdgeNative.Subclass callback;
    private nint captionBits;
    private bool captionCaptured,disposed;
    public nint Handle {get;}
    public bool Enabled {get;private set;}
    public bool IsRestored=>window.AppWindow.Presenter is OverlappedPresenter {State:OverlappedPresenterState.Restored};
    public bool IsMinimized=>window.AppWindow.Presenter is OverlappedPresenter {State:OverlappedPresenterState.Minimized};
    public bool InteractionBlocked=>!EdgeNative.IsWindowEnabled(Handle)||new[]{1,2,4}.Any(key=>EdgeNative.GetAsyncKeyState(key)<0);
    public Action<uint,nuint,nint>? Message;
    public EdgeWindowHost(Window owner)
    {
        window=owner;Handle=WinRT.Interop.WindowNative.GetWindowHandle(owner);callback=Process;
        if(!EdgeNative.SetWindowSubclass(Handle,callback,8317,0))throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    public EdgeRect Bounds=>EdgeNative.GetWindowRect(Handle,out var value)?value.Value:throw new Win32Exception();
    public EdgeScreen Screen
    {
        get{var info=new EdgeNative.MonitorInfo{Size=(uint)Marshal.SizeOf<EdgeNative.MonitorInfo>()};
            if(!EdgeNative.GetMonitorInfoW(EdgeNative.MonitorFromWindow(Handle,2),ref info))throw new Win32Exception();
            return new(info.Monitor.Value,info.Work.Value);}
    }
    public static List<EdgeRect> Screens()
    {
        var result=new List<EdgeRect>();EdgeNative.MonitorCallback callback=(nint monitor,nint hdc,ref EdgeNative.Rect rect,nint data)=>{result.Add(rect.Value);return true;};
        if(!EdgeNative.EnumDisplayMonitors(0,0,callback,0))throw new Win32Exception();return result;
    }
    public EdgeInsets Insets(EdgeInsets previous)
    {
        var outer=Bounds;
        if(EdgeNative.DwmGetWindowAttribute(Handle,9,out var rect,Marshal.SizeOf<EdgeNative.Rect>())<0)return previous;
        var visible=rect.Value;if(visible.Width<=0||visible.Height<=0)return previous;
        var value=new EdgeInsets(Math.Max(0,visible.Left-outer.Left),Math.Max(0,visible.Top-outer.Top),Math.Max(0,outer.Right-visible.Right),Math.Max(0,outer.Bottom-visible.Bottom));
        var limit=(int)Math.Ceiling(64*Math.Max(1,EdgeNative.GetDpiForWindow(Handle)/96d));
        return new[]{value.Left,value.Top,value.Right,value.Bottom}.Any(item=>item>limit)
            ||value.Left+value.Right>=outer.Width||value.Top+value.Bottom>=outer.Height?previous:value;
    }
    public void Move(EdgeRect target,bool positionOnly=false)
    {
        if(!EdgeNative.SetWindowPos(Handle,0,target.Left,target.Top,target.Width,target.Height,positionOnly?0x0015u:0x0014u))
            throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    public void Configure(bool enabled,bool pinned,bool collapsed)
    {
        if(window.AppWindow.Presenter is not OverlappedPresenter presenter)return;
        if(enabled!=Enabled){
            if(enabled){captionBits=EdgeNative.GetWindowLongPtr(Handle,-16)&0x30000;captionCaptured=true;if(!IsRestored)presenter.Restore();}
            Enabled=enabled;var before=EdgeNative.GetWindowLongPtr(Handle,-16);
            var after=(before&~(nint)0x30000)|(enabled?0:captionCaptured?captionBits:before&0x30000);
            Marshal.SetLastPInvokeError(0);var prior=EdgeNative.SetWindowLongPtr(Handle,-16,after);
            if(prior==0&&Marshal.GetLastPInvokeError()!=0)throw new Win32Exception(Marshal.GetLastPInvokeError());
            if(!EdgeNative.SetWindowPos(Handle,0,0,0,0,0,0x0037))throw new Win32Exception(Marshal.GetLastWin32Error());
            WindowTitleBar.RefreshCaptionLayout(window,enabled?1:1+((captionBits&0x20000)!=0?1:0)+((captionBits&0x10000)!=0?1:0));
        }
        presenter.IsAlwaysOnTop=enabled?collapsed:pinned;
    }
    private nint Process(nint hwnd,uint message,nuint wParam,nint lParam,nuint id,nuint data)
    {
        if(!disposed){
            if(Enabled&&((message==0x0112&&(wParam&0xFFF0)==0xF030)||(message==0x00A3&&wParam==2)))return 0;
            if(Enabled&&message is 0x0200 or 0x00A0){var track=new EdgeNative.MouseTrack{Size=(uint)Marshal.SizeOf<EdgeNative.MouseTrack>(),Flags=2u|(message==0x00A0?0x10u:0u),Window=hwnd};EdgeNative.TrackMouseEvent(ref track);}
            Message?.Invoke(message,wParam,lParam);
        }
        return EdgeNative.DefSubclassProc(hwnd,message,wParam,lParam);
    }
    public void Dispose(){if(disposed)return;disposed=true;Message=null;EdgeNative.RemoveWindowSubclass(Handle,callback,8317);}
}
