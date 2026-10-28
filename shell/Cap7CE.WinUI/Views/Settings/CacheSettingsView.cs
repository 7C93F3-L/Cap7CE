using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Localization;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Views;

internal sealed class CacheSettingsView : StackPanel
{
    private readonly ShellServices services;
    private readonly Window owner;
    private readonly Action<UiMessage> notice;
    private readonly TextBlock summary=L.Text("ui.cache.measuring",true);
    private readonly Button clear;
    private bool busy;
    public CacheSettingsView(ShellServices services,Window owner,Action<UiMessage> notice)
    {
        this.services=services;this.owner=owner;this.notice=notice;
        Spacing=8;HorizontalAlignment=HorizontalAlignment.Right;
        clear=L.Button("ui.cache.clear",()=>_=ClearAsync());clear.HorizontalAlignment=HorizontalAlignment.Right;
        Children.Add(summary);Children.Add(clear);
        Loaded+=async(_,_)=>await RefreshAsync();
    }
    private async Task RefreshAsync()
    {
        try {var stats=await services.GetCacheStatsAsync();L.Bind(summary,TextBlock.TextProperty,"ui.cache.stats",()=>new Dictionary<string,object?>{{"count",stats.Count},{"size",Size(stats.Bytes)}});}
        catch {L.Bind(summary,TextBlock.TextProperty,"ui.cache.unavailable");}
    }
    private async Task ClearAsync()
    {
        if(busy)return;busy=true;clear.IsEnabled=false;
        try
        {
            var dialog=L.Dialog(owner.Content.XamlRoot,"ui.cache.clear","ui.cache.confirm","ui.cache.confirmAction");
            if(await dialog.ShowAsync()!=ContentDialogResult.Primary)return;
            L.Bind(summary,TextBlock.TextProperty,"ui.cache.clearing");
            await services.ClearVisualCacheAsync();
            notice(UiMessage.Key("ui.cache.cleared"));
            await RefreshAsync();
        }
        catch(Exception error){notice(UiMessage.Key("ui.cache.failed",new Dictionary<string,object?>{{"error",error.Message}}));await RefreshAsync();}
        finally{busy=false;clear.IsEnabled=true;}
    }
    private static string Size(long bytes)
    {
        string[] units=["B","KB","MB","GB","TB"];var value=(double)bytes;var unit=0;
        while(value>=1024&&unit<units.Length-1){value/=1024;unit++;}
        return $"{value:0.##} {units[unit]}";
    }
}
