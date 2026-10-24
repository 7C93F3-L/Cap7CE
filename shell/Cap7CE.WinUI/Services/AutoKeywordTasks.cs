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
        if(Busy)throw new IOException("已有关键词任务正在处理，请先等待或取消。");
        if(source.Count is 0 or >100000)throw new IOException("请选择文件或目录。");
        cancellation?.Dispose();cancellation=new();Busy=true;
        return running=RunAsync(source.ToArray(),cancellation.Token);
    }
    public void Cancel(){if(Busy){cancellation?.Cancel();Set(State with{Message="正在取消；已保存的关键词会保留。"});}}
    private async Task RunAsync(IReadOnlyList<AssetItem> source,CancellationToken token)
    {
        Set(new("收集文件"));
        try {
            if(services.Core?.IsConnected!=true)await services.ConnectAsync(onlyIfDisconnected:true);
            var collected=await AutoKeywordTargets.CollectAsync(services,source,token,count=>Set(State with{Total=count}));
            Set(State with{Total=collected.Items.Count+collected.Failed,Failed=collected.Failed,Processed=collected.Failed,
                Message=collected.Failed>0?"部分目录未能完整读取，请确认目录已入库且可访问。":""});
            var processor=new AutoKeywordProcessor(services);
            foreach(var item in collected.Items) {
                token.ThrowIfCancellationRequested();Set(State with{Name=item.Name,Phase="准备"});
                if(FormatRegistry.Find(item.Entry.Extension)?.CanAIIndex!=true){Set(State with{Processed=State.Processed+1,Skipped=State.Skipped+1});if(State.Processed%100==0)await Task.Yield();continue;}
                try {
                    await processor.ProcessAsync(item,token,phase=>Set(State with{Phase=phase}));
                    Set(State with{Succeeded=State.Succeeded+1,Processed=State.Processed+1});Saved?.Invoke(item);
                }catch(OperationCanceledException)when(token.IsCancellationRequested){throw;}
                catch(Exception error) {
                    var fatal=State.Phase=="启动模型"||error is AutoKeywordRuntimeException;
                    Set(State with{Failed=State.Failed+1,Processed=State.Processed+1,Message=Message(error)});
                    if(fatal){Set(State with{Phase="失败"});return;}
                }
            }
            Set(State with{Phase="完成"});
        }catch(OperationCanceledException)when(token.IsCancellationRequested){Set(State with{Phase="已取消"});}
        catch(Exception error){Set(State with{Phase="失败",Message=Message(error)});}
        finally{Busy=false;Changed?.Invoke();if(State.Succeeded>0)services.RefreshViews();}
    }
    private static string Message(Exception error)
    {
        var text=error.Data["CoreMessage"] as string??error.Message;
        return text.Any(character=>character is >= '\u4e00' and <= '\u9fff')?text[..Math.Min(text.Length,240)]:"自动添加关键词失败，请检查目录索引、本地模型和源文件后重试。";
    }
    public async ValueTask DisposeAsync(){Cancel();if(running is not null)await running;cancellation?.Dispose();}
}
