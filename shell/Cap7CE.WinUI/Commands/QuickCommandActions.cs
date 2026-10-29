using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Controllers;
using Cap7CE.WinUI.Localization;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;

namespace Cap7CE.WinUI.Commands;
internal sealed class QuickCommandActions(ShellServices services,Window window,Func<BrowseSession> session,WorkspacePreferencesController workspace,Action settings,Func<bool,Task> pin,Func<bool> canChangeView,Action exit)
{
    public QuickCommand Prepare(QuickCommand command)=>command.Id=="dir:remove"?command with{TargetId=FindFavorite(command.Args[0]).Id}:command;
    public async Task ExecuteAsync(QuickCommand command)
    {
        var id=command.Id;var arg=command.Args.FirstOrDefault()??"";var enabled=arg.Equals("on",StringComparison.OrdinalIgnoreCase);
        var prefs=services.Preferences;var page=session();
        switch(id){
            case "set:":settings();return;
            case "see:root":await page.OpenLocationAsync("",false);return;
            case "see:dir":{var favorite=FindFavorite(arg);await page.OpenLocationAsync(favorite.Path,true);return;}
            case "see:refresh":await page.NavigateAsync(page.PathValue,false);return;
            case "see:hidden":await workspace.UpdateAsync(v=>v with{ShowHidden=enabled},true);return;
            case "see:subfolders":if(page.PathValue.Length==0)throw new UiFailure("main.enterFolder");await workspace.UpdateAsync(v=>v with{Recursive=enabled},true);return;
            case "see:sort":
                page.Random=false;arg=arg.ToLowerInvariant();
                await workspace.UpdateAsync(v=>v with{Sort=arg switch{"asc"=>v.Sort.Split('-')[0]+"-ascending","desc"=>v.Sort.Split('-')[0]+"-descending","time"=>"modified-"+v.Sort.Split('-')[1],_=>"name-"+v.Sort.Split('-')[1]}},true);return;
            case "see:view":
                if(!canChangeView())throw new UiFailure("main.compactView");
                arg=arg.ToLowerInvariant();await workspace.UpdateAsync(v=>v with{View=arg=="list"?"list":"grid",SquareTiles=arg=="list"?v.SquareTiles:arg=="square"});return;
            case "win:reset":MainWindowGeometry.RestoreDefault(window);return;
            case "win:max":
                if(prefs.Current.EdgeCollapseEnabled)throw new UiFailure("ui.command.standardWindow");
                if(window.AppWindow.Presenter is OverlappedPresenter presenter){if(presenter.State==OverlappedPresenterState.Maximized)presenter.Restore();else presenter.Maximize();}return;
            case "win:top":if(prefs.Current.EdgeCollapseEnabled)throw new UiFailure("ui.command.standardWindow");await pin(enabled);return;
            case "win:edge":await prefs.UpdateAsync(v=>v with{EdgeCollapseEnabled=enabled});return;
            case "dir:add":
                if(!Path.IsPathFullyQualified(arg)||!Directory.Exists(arg))throw new UiFailure("ui.command.directory");FileAccessGuard.RejectLinks(arg);
                await services.Favorites.ExecuteAsync("add",path:arg);return;
            case "dir:remove":{var favorite=services.Favorites.Items.SingleOrDefault(f=>f.Id==command.TargetId)??throw new UiFailure("ui.command.uniqueMatch");await services.Favorites.ExecuteAsync("remove",id:favorite.Id);return;}
            case "ui:light":case "ui:dark":case "ui:auto":await prefs.UpdateAsync(v=>v with{Theme=id=="ui:auto"?"system":id[3..]});return;
            case "ui:mica":case "ui:mica-alt":await prefs.UpdateAsync(v=>v with{Material=id[3..]});return;
            case "ui:main":await prefs.UpdateAsync(v=>v with{Color1=arg.ToUpperInvariant()});return;
            case "ui:accent":await prefs.UpdateAsync(v=>v with{Color2=arg.ToUpperInvariant()});return;
            case "ui:reset":var defaults=new ShellPreferences();await prefs.UpdateAsync(v=>v with{Color1=defaults.Color1,Color2=defaults.Color2});return;
            case "key:reset":await prefs.UpdateAsync(v=>v with{ShortcutBindings=[]});return;
            case "lang:auto":case "lang:cn":case "lang:en":await prefs.UpdateAsync(v=>v with{Language=id=="lang:auto"?"system":id=="lang:cn"?"zh-CN":"en-US"});return;
            case "app:startup":SystemSettings.LaunchAtLogin=enabled;return;
            case "app:notify":await services.Notifications.SetEnabledAsync(prefs,enabled);return;
            case "app:quit":exit();return;
            case "cache:clear":await services.ClearVisualCacheAsync();return;
            default:await new ModelCommandActions(services).ExecuteAsync(id,arg);return;
        }
    }
    private Favorite FindFavorite(string value)
    {
        var matches=services.Favorites.Items.Where(f=>string.Equals(f.Name,value,StringComparison.OrdinalIgnoreCase)||string.Equals(f.Path,value,StringComparison.OrdinalIgnoreCase)).ToArray();
        if(matches.Length!=1)throw new UiFailure("ui.command.uniqueMatch");return matches[0];
    }
}
