using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Views;

internal sealed class CacheSettingsView : StackPanel
{
    private readonly ShellServices services;
    private readonly Window owner;
    private readonly Action<string> notice;
    private readonly TextBlock summary=Ui.Text("正在统计…",true);
    private readonly Button clear;
    private bool busy;
    public CacheSettingsView(ShellServices services,Window owner,Action<string> notice)
    {
        this.services=services;this.owner=owner;this.notice=notice;
        Spacing=8;HorizontalAlignment=HorizontalAlignment.Right;
        clear=Ui.Button("清理缓存",()=>_=ClearAsync());clear.HorizontalAlignment=HorizontalAlignment.Right;
        Children.Add(summary);Children.Add(clear);
        Loaded+=async(_,_)=>await RefreshAsync();
    }
    private async Task RefreshAsync()
    {
        try {var stats=await services.GetCacheStatsAsync();summary.Text=$"{stats.Count:N0} 项 · {Size(stats.Bytes)}";}
        catch {summary.Text="缓存统计暂不可用";}
    }
    private async Task ClearAsync()
    {
        if(busy)return;busy=true;clear.IsEnabled=false;
        try
        {
            var dialog=new ContentDialog {XamlRoot=owner.Content.XamlRoot,Title="清理缓存",Content="清理缩略图、预览图片及 Office 文档转换缓存？下次查看时会按需重新生成，源文件、索引和关键词保持不变。",PrimaryButtonText="清理",CloseButtonText="取消",DefaultButton=ContentDialogButton.Close};
            if(await dialog.ShowAsync()!=ContentDialogResult.Primary)return;
            summary.Text="正在清理…";
            await services.ClearVisualCacheAsync();
            notice("缓存已清理。");
            await RefreshAsync();
        }
        catch(Exception error){notice("缓存清理未完成："+error.Message);await RefreshAsync();}
        finally{busy=false;clear.IsEnabled=true;}
    }
    private static string Size(long bytes)
    {
        string[] units=["B","KB","MB","GB","TB"];var value=(double)bytes;var unit=0;
        while(value>=1024&&unit<units.Length-1){value/=1024;unit++;}
        return $"{value:0.##} {units[unit]}";
    }
}
