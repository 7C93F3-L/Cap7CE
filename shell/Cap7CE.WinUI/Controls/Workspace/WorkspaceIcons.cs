using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using L=Cap7CE.WinUI.Localization.LanguageUi;
namespace Cap7CE.WinUI.Controls;
// Paths used by the active CatalogToolbarIcon, drawn with the shared theme-aware vector.
internal static class WorkspaceIcons
{
    private static readonly Dictionary<string,string> paths=new(){
        ["back"]="M19 12H5m7-7-7 7 7 7",["forward"]="M5 12h14m-7-7 7 7-7 7",["up"]="M12 19V5m-7 7 7-7 7 7",
        ["refresh"]="M20 4v6h-6M20 10a8 8 0 1 0-2 8",["computer"]="M4 4h16v12H4zM12 16v4m-4 0h8",
        ["size"]="M8 4H4v4M16 4h4v4M4 16v4h4M20 16v4h-4M8 8h8v8H8z",
        ["shuffle"]="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4",
        ["tree"]="M5 3v13h5M5 7h5M10 4h10v6H10zM10 13h10v6H10z",["files"]="M4 5h14v16H4zM8 2h13v15M8 10h6M8 14h6",
        ["eye"]="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
        ["eyeOff"]="m3 3 18 18M10 5.2a12 12 0 0 1 2-.2c6.5 0 10 7 10 7a19 19 0 0 1-3 3.8M6 6.5A21 21 0 0 0 2 12s3.5 7 10 7a13 13 0 0 0 5-1M10 10a3 3 0 0 0 4 4",
        ["grid"]="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
        ["list"]="M3 5h.01M3 12h.01M3 19h.01M7 5h14M7 12h14M7 19h14",
        ["search"]="M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6",
        ["sort"]="M7 4v16m-4-4 4 4 4-4M14 5h7M14 10h5M14 15h3"
    };
    public static SidebarIcon Icon(string id)=>new(){OutlinePath=paths[id],Width=16,Height=16};
    public static void Label(FrameworkElement element,string text){L.Literal(element,ToolTipService.ToolTipProperty,text);L.Literal(element,AutomationProperties.NameProperty,text);}
    public static Button ResourceButton(string id,string key,Action action)
    {var button=Button(id,"",action);L.Label(button,key);return button;}
    public static ToggleButton ResourceToggle(string id,string key,Action action)
    {var button=Toggle(id,"",action);L.Label(button,key);return button;}
    public static Button Button(string id,string label,Action action)
    {var button=new Button{Style=(Style)Application.Current.Resources["CapWorkspaceTool"],Content=Icon(id)};Label(button,label);button.Click+=(_,_)=>action();return button;}
    public static ToggleButton Toggle(string id,string label,Action action)
    {var button=new ToggleButton{Style=(Style)Application.Current.Resources["CapWorkspaceToggle"]};var icon=Icon(id);button.Content=icon;FilterIcons.BindSelection(icon,button);Label(button,label);button.Click+=(_,_)=>action();return button;}
}
