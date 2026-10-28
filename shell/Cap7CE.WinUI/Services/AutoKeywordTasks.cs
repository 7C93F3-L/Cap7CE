using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;

internal sealed class AutoKeywordTasks(ShellServices services):IAsyncDisposable
{
    private CancellationTokenSource? cancellation;
    private Task? running;
    public bool Busy {get;private set;}
    public bool Cancelling=>Busy&&cancellation?.IsCancellationRequested==true;
    public AutoKeywordState State {get;private set;}=new();
    public event Action? Changed;
    public event Action<AssetItem>? Saved;
    private void Set(AutoKeywordState state){State=state;Changed?.Invoke();}
    public Task StartAsync(IReadOnlyList<AssetItem> source)
    {
        if(Busy)throw new UiFailure("ui.error.autoBusy");
        if(source.Count is 0 or >100000)throw new UiFailure("ui.error.autoSelection");
        cancellation?.Dispose();cancellation=new();Busy=true;
        var notificationId=Guid.NewGuid().ToString("N");services.TaskNotices.Begin("ai",notificationId);
        var language=Localization.AppLanguage.Session.Current;
        return running=RunAsync(source.ToArray(),language,notificationId,cancellation.Token);
    }
    public void Cancel(){if(Busy){cancellation?.Cancel();Set(State with{DisplayMessage=UiMessage.Key("ui.error.autoCancelling")});}}
    private async Task RunAsync(IReadOnlyList<AssetItem> source,string language,string notificationId,CancellationToken token)
    {
        Set(new("收集文件"));
        try {
            if(services.Core?.IsConnected!=true)await services.ConnectAsync(onlyIfDisconnected:true);
            var collected=await AutoKeywordTargets.CollectAsync(services,source,token,count=>Set(State with{Total=count}));
            Set(State with{Total=collected.Items.Count+collected.Failed,Failed=collected.Failed,Processed=collected.Failed,
                DisplayMessage=collected.Failed>0?UiMessage.Key("ui.error.autoPartial"):null});
            var processor=new AutoKeywordProcessor(services,language);
            foreach(var item in collected.Items) {
                token.ThrowIfCancellationRequested();Set(State with{Name=item.Name,Phase="准备"});
                if(FormatRegistry.Find(item.Entry.Extension)?.CanAIIndex!=true){Set(State with{Processed=State.Processed+1,Skipped=State.Skipped+1});if(State.Processed%100==0)await Task.Yield();continue;}
                try {
                    await processor.ProcessAsync(item,token,phase=>Set(State with{Phase=phase}));
                    Set(State with{Succeeded=State.Succeeded+1,Processed=State.Processed+1});Saved?.Invoke(item);
                }catch(OperationCanceledException)when(token.IsCancellationRequested){throw;}
                catch(Exception error) {
                    var fatal=State.Phase=="启动模型"||error is AutoKeywordRuntimeException;
                    Set(State with{Failed=State.Failed+1,Processed=State.Processed+1,DisplayMessage=Message(error)});
                    if(fatal){Set(State with{Phase="失败"});return;}
                }
            }
            Set(State with{Phase="完成"});
        }catch(OperationCanceledException)when(token.IsCancellationRequested){Set(State with{Phase="已取消"});}
        catch(Exception error){Set(State with{Phase="失败",DisplayMessage=Message(error)});}
        finally{
            Busy=false;Changed?.Invoke();if(State.Succeeded>0)services.RefreshViews();
            services.TaskNotices.Finish("ai",notificationId,token.IsCancellationRequested||State.Phase=="已取消"?"cancelled":State.Phase=="失败"?"failed":"completed",State.Processed,State.Failed,State.Skipped);
        }
    }
    private static UiMessage Message(Exception error)=>FailureText.Keyword(error);
    public async ValueTask DisposeAsync(){Cancel();if(running is not null)await running;cancellation?.Dispose();}
}
