using System.Runtime.InteropServices;
using Cap7CE.WinUI.Services;
namespace Cap7CE.WinUI.DesktopActions;
// A nonactivating input-transparent native surface, always immediately behind the capsule.
internal sealed class CapsuleShadowWindow : IDisposable
{
    // WS_EX_NOACTIVATE | WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT | WS_EX_TOPMOST.
    private const uint ShadowStyles=0x080800a8;
    private nint handle;
    private (int Width,int Height,double Scale)? rendered;
    private bool unavailable,disposed;
    public void Update(nint capsule,int x,int y,int width,int height,double scale,bool visible)
    {
        if(disposed||unavailable)return;
        if(!visible){if(handle!=0)ShowWindow(handle,0);return;}
        try{
            if(handle==0){handle=CreateWindowExW(ShadowStyles,"STATIC","",0x80000000,0,0,1,1,0,0,0,0);if(handle==0)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}
            var pad=CapsuleShadowTexture.Padding(scale);var key=(width,height,scale);
            if(rendered!=key){
                var pixels=CapsuleShadowTexture.Pixels(width,height,scale);
                CapsuleLayeredSurface.Upload(handle,x-pad,y-pad,width+2*pad,height+2*pad,pixels);rendered=key;
            }
            if(!SetWindowPos(handle,capsule,x-pad,y-pad,width+2*pad,height+2*pad,0x50))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }catch(Exception error){unavailable=true;if(handle!=0){DestroyWindow(handle);handle=0;}NativeDiagnostics.VisualFailure(error);}
    }
    public void Dispose(){disposed=true;if(handle!=0){DestroyWindow(handle);handle=0;}}
    [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern nint CreateWindowExW(uint extendedStyle,string className,string title,uint style,int x,int y,int width,int height,nint parent,nint menu,nint instance,nint parameter);
    [DllImport("user32.dll",SetLastError=true)] private static extern bool SetWindowPos(nint handle,nint after,int x,int y,int width,int height,uint flags);
    [DllImport("user32.dll")] private static extern bool ShowWindow(nint handle,int command);
    [DllImport("user32.dll")] private static extern bool DestroyWindow(nint handle);
}
