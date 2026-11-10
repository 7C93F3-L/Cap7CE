using System.ComponentModel;
using System.Runtime.InteropServices;
using Cap7CE.WinUI.Localization;
namespace Cap7CE.WinUI.Services;
// Owns an HMENU tree and a zero-size native tool owner for hidden-main-window use.
// Windows owns tracking, placement, keyboard navigation and dismissal.
internal static class TrayMenu
{
    public static uint Show(bool edge,bool login,string runtime,bool busy,bool capsule)
    {
        if(!TrayNative.GetCursorPos(out var cursor))throw new Win32Exception();
        var owner=TrayNative.CreateWindowExW(0x80,"STATIC","",0x80000000,cursor.X,cursor.Y,0,0,0,0,0,0);
        if(owner==0)throw new Win32Exception(Marshal.GetLastPInvokeError());
        nint menu=0;
        try{
            menu=Create();
            Item(menu,1,"ui.tray.open");Item(menu,2,"main.settings");Separator(menu);
            Item(menu,32,"ui.desktop.show",capsule?8u:0u);
            Submenu(menu,"settings.edgeCollapse",m=>{
                Item(m,10,"settings.standardWindowMode");Item(m,11,"settings.edgeCollapseMode");
                if(!TrayNative.CheckMenuRadioItem(m,10,11,edge?11u:10u,0))throw new Win32Exception();
            });
            Submenu(menu,"ui.model.serviceTitle",m=>{
                Item(m,20,"common.start",!busy&&runtime=="stopped"?0u:3u);
                Item(m,21,"common.stop",!busy&&runtime=="running"?0u:3u);
            });
            Separator(menu);Item(menu,30,"settings.launchAtLogin",login?8u:0u);
            Item(menu,31,"settings.checkForUpdates");Separator(menu);Item(menu,40,"ui.tray.exit");
            TrayNative.ShowWindow(owner,4);
            if(!TrayNative.SetForegroundWindow(owner))return 0;
            // TPM_RETURNCMD | TPM_NONOTIFY | TPM_RIGHTBUTTON | TPM_RIGHTALIGN | TPM_BOTTOMALIGN.
            return TrayNative.TrackPopupMenuEx(menu,0x1aa,cursor.X,cursor.Y,owner,0);
        }finally{
            TrayNative.PostMessageW(owner,0,0,0);
            if(menu!=0)TrayNative.DestroyMenu(menu);
            TrayNative.DestroyWindow(owner);
        }
    }
    private static nint Create(){var menu=TrayNative.CreatePopupMenu();return menu!=0?menu:throw new Win32Exception();}
    private static void Append(nint menu,uint flags,nuint id,string? text){if(!TrayNative.AppendMenuW(menu,flags,id,text))throw new Win32Exception();}
    private static void Item(nint menu,uint id,string key,uint flags=0)=>Append(menu,flags,id,AppLanguage.Text(key));
    private static void Separator(nint menu)=>Append(menu,0x800,0,null);
    private static void Submenu(nint parent,string key,Action<nint> populate)
    {
        var child=Create();
        try{populate(child);Append(parent,0x10,(nuint)child,AppLanguage.Text(key));}
        catch{TrayNative.DestroyMenu(child);throw;}
    }
}
