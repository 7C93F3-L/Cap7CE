using System.Runtime.InteropServices;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Localization;

namespace Cap7CE.WinUI.Services;

// Owns only this HWND's auto-hide registration; never changes the system taskbar.
internal sealed class EdgeDockRegistration(nint handle) : IDisposable
{
    public DockEdge? Edge {get;private set;}
    public EdgeScreen Screen {get;private set;}
    private EdgeNative.AppBarData Data(DockEdge edge,EdgeRect bounds,bool enable=false)=>new(){
        Size=(uint)Marshal.SizeOf<EdgeNative.AppBarData>(),Window=handle,Edge=(uint)edge,Bounds=EdgeNative.Rect.From(bounds),Param=enable?1:0};
    private nuint Owner(DockEdge edge,EdgeRect bounds){var data=Data(edge,bounds);return EdgeNative.SHAppBarMessage(0xB,ref data);}
    public void Change(DockEdge edge,EdgeScreen screen)
    {
        var occupied=Owner(edge,screen.Bounds);
        if(occupied!=0&&occupied!=(nuint)handle)throw new UiFailure("ui.error.edgeOccupied");
        var oldEdge=Edge;var oldScreen=Screen;
        Release();var request=Data(edge,screen.Bounds,true);
        if(EdgeNative.SHAppBarMessage(0xC,ref request)==0||Owner(edge,screen.Bounds)!=(nuint)handle){
            if(oldEdge is {} old){var restore=Data(old,oldScreen.Bounds,true);if(EdgeNative.SHAppBarMessage(0xC,ref restore)!=0&&Owner(old,oldScreen.Bounds)==(nuint)handle){Edge=old;Screen=oldScreen;}}
            throw new UiFailure("ui.error.edgeUnavailable");
        }
        Edge=edge;Screen=screen;
    }
    public void Release()
    {
        if(Edge is not {} edge)return;var data=Data(edge,Screen.Bounds);
        EdgeNative.SHAppBarMessage(0xC,ref data);
        if(Owner(edge,Screen.Bounds)==(nuint)handle)throw new UiFailure("ui.error.edgeUnavailable");Edge=null;
    }
    public void Dispose()=>Release();
}
