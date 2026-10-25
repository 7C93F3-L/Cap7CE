using System.Text.Json;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;

namespace Cap7CE.WinUI.Controllers;

internal sealed class MetadataNoticeController : IDisposable
{
    private readonly MetadataTasks tasks;
    private readonly WorkspaceNotice notice;
    private readonly VisibleTaskMonitor monitor=new();
    private bool watching,observed,disposed;
    public MetadataNoticeController(MetadataTasks tasks,WorkspaceNotice notice)
    {this.tasks=tasks;this.notice=notice;tasks.Changed+=Changed;}
    private void Changed(JsonElement _,MetadataTaskStatus state)=>notice.DispatcherQueue.TryEnqueue(()=>{
        if(disposed)return;
        if(state.Running) {
            observed=true;notice.SetMetadataTask(state.Text,state.Fraction);
            if(!watching) {
                watching=true;
                monitor.Start(async token=>{await tasks.InvokeAsync("status",token:token);return watching&&!disposed;},
                    error=>{if(disposed)return;watching=false;observed=false;notice.SetMetadataTask(null);notice.ShowMessage("元数据状态读取失败："+error.Message);});
            }
        } else {
            watching=false;monitor.Dispose();notice.SetMetadataTask(null);
            if(observed||state.Owned&&state.Operation is ("start" or "startDirectory" or "startAllVolumes" or "resume")||state.Operation is "pause" or "cancelDirectories")notice.ShowMessage(state.Finished);
            observed=false;
        }
    });
    public void Dispose(){disposed=true;watching=false;monitor.Dispose();tasks.Changed-=Changed;}
}
