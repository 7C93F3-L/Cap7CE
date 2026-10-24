using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Services;

namespace Cap7CE.WinUI.Controllers;

internal sealed class AutoKeywordNoticeController:IDisposable
{
    private readonly AutoKeywordTasks tasks;
    private readonly WorkspaceNotice notice;
    private readonly Action<bool> availability;
    private bool queued,disposed,observed;
    public AutoKeywordNoticeController(AutoKeywordTasks tasks,WorkspaceNotice notice,Action<bool> availability)
    {
        this.tasks=tasks;this.notice=notice;this.availability=availability;
        tasks.Changed+=Changed;notice.CancelTaskRequested+=tasks.Cancel;
    }
    private void Changed()
    {
        if(disposed)return;if(tasks.Busy)observed=true;if(queued)return;queued=true;
        if(!notice.DispatcherQueue.TryEnqueue(()=>{queued=false;if(!disposed)Render();}))queued=false;
    }
    private void Render()
    {
        availability(tasks.Busy);var state=tasks.State;
        if(tasks.Busy) {
            var text=tasks.Cancelling?"正在取消…":"正在识别…";
            if(state.Total>1)text+=$" {state.Processed} / {state.Total}";
            notice.SetTask(text,state.Processed,state.Total,state.Phase=="收集文件"||state.Total<=1,tasks.Cancelling);
        } else if(observed) {
            observed=false;notice.ClearTask();
            var text=state.Phase=="已取消"?"识别已取消":state.Phase=="失败"?"识别失败":state.Failed>0?$"识别完成：成功 {state.Succeeded}，失败 {state.Failed}":state.Succeeded==0?"没有可识别的文件":$"识别完成：{state.Succeeded} 项";
            if(state.Failed>0||state.Phase=="失败")text+=" · "+state.Message;
            notice.ShowMessage(text);
        }
    }
    public void Dispose(){disposed=true;tasks.Changed-=Changed;notice.CancelTaskRequested-=tasks.Cancel;}
}
