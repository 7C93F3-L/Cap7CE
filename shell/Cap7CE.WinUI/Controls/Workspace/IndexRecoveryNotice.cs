using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
namespace Cap7CE.WinUI.Controls;
// Event-driven warning beside existing workspace messages; no timers or automatic builds.
internal sealed class IndexRecoveryNotice : UserControl,IDisposable
{
    private readonly ShellServices services;
    private readonly InfoBar bar=new(){Severity=InfoBarSeverity.Warning,IsClosable=true};
    private readonly Button retry;
    private readonly Action<Localization.UiMessage> report;
    private CatalogStatusResponse snapshot=new([],[],0);
    private string current="",dismissed="";
    private bool busy,disposed;
    public IndexRecoveryNotice(ShellServices services,Action settings,Action<Localization.UiMessage> report)
    {
        this.services=services;this.report=report;Visibility=Visibility.Collapsed;Margin=new(0,0,0,6);
        retry=L.Button("main.retry",Retry);bar.Content=Ui.Row(retry,L.Button("ui.indexRecovery.settings",settings));
        L.Bind(bar,InfoBar.TitleProperty,"ui.indexRecovery.title");Content=bar;
        bar.CloseButtonClick+=(_,_)=>dismissed=current;
        bar.Closed+=(_,_)=>{if(!bar.IsOpen)Visibility=Visibility.Collapsed;};
        services.IndexStatusChanged+=Changed;services.CatalogMaintenanceChanged+=Queue;services.ConnectionChanged+=Queue;
    }
    private void Changed(CatalogStatusResponse value)=>DispatcherQueue.TryEnqueue(()=>{if(disposed)return;snapshot=value;Render();});
    private void Queue()=>DispatcherQueue.TryEnqueue(()=>{if(!disposed)Render();});
    private void Render()
    {
        if(disposed)return;
        var issue=services.Core?.IsConnected==true?IndexRecoveryPolicy.Evaluate(snapshot,services.CatalogMaintenance?.State):null;
        current=issue?.Key??"";
        if(issue is null){dismissed="";bar.IsOpen=false;Visibility=Visibility.Collapsed;return;}
        if(current==dismissed){Visibility=Visibility.Collapsed;return;}
        var key=issue.Kind switch{"failed"=>"ui.indexRecovery.failed","unavailable"=>"ui.indexRecovery.unavailable",_=>"ui.indexRecovery.incomplete"};
        L.Bind(bar,InfoBar.MessageProperty,key,()=>new Dictionary<string,object?>{{"drives",issue.Drives}});
        retry.Visibility=issue.CanRetry?Visibility.Visible:Visibility.Collapsed;retry.IsEnabled=!busy;
        Visibility=Visibility.Visible;bar.IsOpen=true;
    }
    private async void Retry()
    {
        if(busy||disposed)return;busy=true;retry.IsEnabled=false;
        try{await IndexBuildActions.RetryAsync(services);}
        catch(Exception error){if(!disposed)report(Localization.FailureText.From(error));}
        finally{busy=false;if(!disposed)Render();}
    }
    public void Dispose(){disposed=true;services.IndexStatusChanged-=Changed;services.CatalogMaintenanceChanged-=Queue;services.ConnectionChanged-=Queue;}
}
