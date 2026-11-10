using System.Runtime.InteropServices;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
namespace Cap7CE.WinUI.DesktopActions;
// The capsule HWND alone owns non-client policy and transparent-corner hit testing.
internal sealed class CapsuleWindowFrame : IDisposable
{
    private readonly Window window;
    private readonly nint handle;
    private readonly Subclass callback;
    private bool queued,disposed;
    public CapsuleWindowFrame(Window window,OverlappedPresenter presenter)
    {
        this.window=window;handle=WinRT.Interop.WindowNative.GetWindowHandle(window);
        presenter.PreferredMinimumWidth=1;presenter.PreferredMinimumHeight=1;
        callback=ProcessMessage;
        if(!SetWindowSubclass(handle,callback,8401,0))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        var style=GetWindowLongPtrW(handle,-16);SetWindowLongPtrW(handle,-16,(style&~(nint)0x00cf0000)|(nint)unchecked((int)0x80000000));
        SetWindowPos(handle,0,0,0,0,0,0x37);
        window.AppWindow.Changed+=Changed;
        Apply();CapsuleTransparency.Enable(handle);
    }
    private void Changed(AppWindow sender,AppWindowChangedEventArgs args)
    {
        if(disposed||queued||!args.DidPositionChange&&!args.DidSizeChange)return;
        queued=true;window.DispatcherQueue.TryEnqueue(Microsoft.UI.Dispatching.DispatcherQueuePriority.Low,()=>{
            queued=false;if(!disposed)Apply();
        });
    }
    public void Apply()
    {
        // Disable DWM's rectangular non-client border, shadow and automatic corners.
        var disabled=1;DwmSetWindowAttribute(handle,2,ref disabled,sizeof(int));
        var square=1;DwmSetWindowAttribute(handle,33,ref square,sizeof(int));
        var noBorder=unchecked((int)0xfffffffe);DwmSetWindowAttribute(handle,34,ref noBorder,sizeof(int));

    }
    private nint ProcessMessage(nint hwnd,uint message,nuint wParam,nint lParam,nuint id,nuint data)
    {
        if(message==0x14&&CapsuleTransparency.Clear(hwnd,(nint)wParam))return 1;
        if(message==0x31e){CapsuleTransparency.Enable(hwnd);Apply();return 0;}
        if(message==0x84&&GetWindowRect(hwnd,out var bounds)){
            var x=(short)(lParam.ToInt64()&0xffff)-bounds.Left;var y=(short)((lParam.ToInt64()>>16)&0xffff)-bounds.Top;
            if(!CapsuleShape.Contains(bounds.Right-bounds.Left,bounds.Bottom-bounds.Top,x,y))return -1;
        }
        if(message==0x83)return 0; // WM_NCCALCSIZE: the entire capsule is client area.
        var result=DefSubclassProc(hwnd,message,wParam,lParam);
        if(message==0x24&&lParam!=0){var info=Marshal.PtrToStructure<MinMaxInfo>(lParam);info.MinTrack=new(){X=1,Y=1};Marshal.StructureToPtr(info,lParam,false);}
        return result;
    }
    public void Dispose(){disposed=true;window.AppWindow.Changed-=Changed;RemoveWindowSubclass(handle,callback,8401);}
    private delegate nint Subclass(nint hwnd,uint message,nuint wParam,nint lParam,nuint id,nuint data);
    [StructLayout(LayoutKind.Sequential)] private struct Rect {public int Left,Top,Right,Bottom;}
    [DllImport("user32.dll")] private static extern bool GetWindowRect(nint handle,out Rect bounds);
    private struct Point {public int X,Y;public Point(){X=Y=0;}}
    private struct MinMaxInfo {public Point Reserved,MaxSize,MaxPosition,MinTrack,MaxTrack;public MinMaxInfo(){Reserved=MaxSize=MaxPosition=MinTrack=MaxTrack=default;}}
    [DllImport("comctl32.dll",SetLastError=true)] private static extern bool SetWindowSubclass(nint handle,Subclass callback,nuint id,nuint data);
    [DllImport("comctl32.dll")] private static extern bool RemoveWindowSubclass(nint handle,Subclass callback,nuint id);
    [DllImport("comctl32.dll")] private static extern nint DefSubclassProc(nint handle,uint message,nuint wParam,nint lParam);
    [DllImport("user32.dll")] private static extern nint GetWindowLongPtrW(nint handle,int index);
    [DllImport("user32.dll")] private static extern nint SetWindowLongPtrW(nint handle,int index,nint value);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(nint handle,nint after,int x,int y,int width,int height,uint flags);
    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(nint handle,int attribute,ref int value,int size);
}
