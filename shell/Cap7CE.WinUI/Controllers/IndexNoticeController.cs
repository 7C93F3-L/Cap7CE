using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Services;

namespace Cap7CE.WinUI.Controllers;

// Observes existing work only; never starts or resumes an index build.
internal sealed class IndexNoticeController : IDisposable
{
    private readonly ShellServices services;
    private readonly WorkspaceNotice notice;
    private readonly VisibleTaskMonitor monitor=new();
    private bool watching,disposed;
    private readonly HashSet<string> observed=[];
    public IndexNoticeController(ShellServices services,WorkspaceNotice notice)
    {this.services=services;this.notice=notice;services.IndexStatusChanged+=Changed;}
    private void Changed(CatalogStatusResponse snapshot)=>notice.DispatcherQueue.TryEnqueue(()=>{
        if(disposed)return;
        var running=snapshot.Tasks.Where(t=>t.State=="running").ToArray();
        foreach(var task in running)observed.Add(task.TaskId);
        if(running.Length>0) {
            var p=snapshot.Preparation;
            var stage=p?.Stage switch {"preparing"=>"正在准备索引…","scanning"=>"正在建立索引…","publishing"=>"正在保存索引…","syncing"=>"正在更新索引…",_=>"正在建立 / 更新索引…"};
            var text=p is null?stage:$"{stage} {p.Drive} · 已处理 {p.Processed:N0} 项";
            notice.SetIndexTask(text,p?.Fraction);
            if(!watching) {
                watching=true;
                monitor.Start(async token=>{token.ThrowIfCancellationRequested();await services.RefreshVolumesAsync();return watching&&!disposed;},
                    error=>{watching=false;notice.SetIndexTask(null);notice.ShowMessage("索引状态读取失败："+error.Message);});
            }
        } else {
            watching=false;monitor.Dispose();notice.SetIndexTask(null);
            var finished=snapshot.Tasks.Where(t=>observed.Remove(t.TaskId)).ToArray();
            if(finished.Length>0)notice.ShowMessage(finished.Any(t=>t.State=="failed")?"索引更新失败，请在设置中查看。":
                finished.Any(t=>t.State=="cancelled")?"索引更新已停止。":"索引更新完成。");
        }
    });
    public void Dispose(){disposed=true;watching=false;monitor.Dispose();services.IndexStatusChanged-=Changed;}
}
