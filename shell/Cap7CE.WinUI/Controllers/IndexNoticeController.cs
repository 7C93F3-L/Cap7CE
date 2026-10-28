using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Localization;
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
            var stage=UiMessage.Key(ProgressText.IndexStageKey(p?.Stage));
            var text=p is null?stage:UiMessage.Key("ui.progress.indexDetails",new Dictionary<string,object?>{{"stage",stage},{"drive",p.Drive},{"count",p.Processed}});
            notice.SetIndexTask(text,p?.Fraction);
            if(!watching) {
                watching=true;
                monitor.Start(async token=>{token.ThrowIfCancellationRequested();await services.RefreshVolumesAsync();return watching&&!disposed;},
                    error=>{watching=false;notice.SetIndexTask(null);notice.ShowMessage(UiMessage.Key("ui.progress.indexReadFailed",new Dictionary<string,object?>{{"error",error.Message}}));});
            }
        } else {
            watching=false;monitor.Dispose();notice.SetIndexTask(null);
            var finished=snapshot.Tasks.Where(t=>observed.Remove(t.TaskId)).ToArray();
            if(finished.Length>0)notice.ShowMessage(UiMessage.Key(finished.Any(t=>t.State=="failed")?"ui.progress.indexFailed":
                finished.Any(t=>t.State=="cancelled")?"ui.progress.indexStopped":"ui.progress.indexCompleted"));
        }
    });
    public void Dispose(){disposed=true;watching=false;monitor.Dispose();services.IndexStatusChanged-=Changed;}
}
