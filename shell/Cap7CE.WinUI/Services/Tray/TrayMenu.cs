using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Text;
using L=Cap7CE.WinUI.Localization.LanguageUi;
namespace Cap7CE.WinUI.Services;
// Builds native WinUI menu controls only; the host owns popup lifetime and positioning.
internal static class TrayMenu
{
    public static MenuFlyout Create(bool edge,bool login,string runtime,bool busy,Action<uint> selected)
    {
        var menu=ThemeService.Menu();menu.ShouldConstrainToRootBounds=false;
        var open=L.MenuItem("ui.tray.open",()=>selected(1));open.FontWeight=FontWeights.SemiBold;menu.Items.Add(open);
        menu.Items.Add(L.MenuItem("main.settings",()=>selected(2)));menu.Items.Add(new MenuFlyoutSeparator());
        var modes=new MenuFlyoutSubItem();L.Bind(modes,MenuFlyoutSubItem.TextProperty,"settings.edgeCollapse");
        foreach(var (id,key) in new[]{(10u,"settings.standardWindowMode"),(11u,"settings.edgeCollapseMode")}){
            var option=new RadioMenuFlyoutItem{IsChecked=edge==(id==11),GroupName="tray-window-mode"};L.Bind(option,RadioMenuFlyoutItem.TextProperty,key);
            option.Click+=(_,_)=>selected(id);modes.Items.Add(option);
        }
        menu.Items.Add(modes);
        var service=new MenuFlyoutSubItem();L.Bind(service,MenuFlyoutSubItem.TextProperty,"ui.model.serviceTitle");
        var start=L.MenuItem("common.start",()=>selected(20));start.IsEnabled=!busy&&runtime=="stopped";
        var stop=L.MenuItem("common.stop",()=>selected(21));stop.IsEnabled=!busy&&runtime=="running";
        service.Items.Add(start);service.Items.Add(stop);menu.Items.Add(service);menu.Items.Add(new MenuFlyoutSeparator());
        var startup=new ToggleMenuFlyoutItem{IsChecked=login};L.Bind(startup,ToggleMenuFlyoutItem.TextProperty,"settings.launchAtLogin");startup.Click+=(_,_)=>selected(30);menu.Items.Add(startup);
        menu.Items.Add(L.MenuItem("settings.checkForUpdates",()=>selected(31)));menu.Items.Add(new MenuFlyoutSeparator());
        menu.Items.Add(L.MenuItem("ui.tray.exit",()=>selected(40)));return menu;
    }
}
