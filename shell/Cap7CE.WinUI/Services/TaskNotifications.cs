using Cap7CE.WinUI.Localization;

namespace Cap7CE.WinUI.Services;

// Session-local notification policy. No polling, task control, window APIs or persistence.
internal sealed class TaskNotifications(Action<UiMessage> send,Func<TimeSpan>? elapsed=null)
{
    private readonly Func<TimeSpan> clock=elapsed??(()=>TimeSpan.FromMilliseconds(Environment.TickCount64));
    private readonly Dictionary<(string Kind,string Id),TimeSpan> active=[];
    public Func<string,bool> IsObserved {get;set;}=_=>false;
    public void Begin(string kind,string id)=>active.TryAdd((kind,id),clock());
    public void Forget(string kind,string id)=>active.Remove((kind,id));
    public void Clear()=>active.Clear();
    public void ForgetKind(string kind)
    {foreach(var key in active.Keys.Where(key=>key.Kind==kind).ToArray())active.Remove(key);}
    public void IndexStatus(IEnumerable<(string Id,string State)> tasks)
    {
        foreach(var task in tasks)if(task.State is "completed" or "failed" or "cancelled")
            Finish("index",task.Id,task.State);
    }
    public void Finish(string kind,string id,string state,long? processed=null,long failed=0,long skipped=0)
    {
        if(state is not ("completed" or "failed" or "cancelled"))return;
        if(!active.Remove((kind,id),out var began)||state=="cancelled")return;
        if(IsObserved(kind))return;
        if(state=="completed"&&failed==0&&clock()-began<TimeSpan.FromSeconds(10))return;
        var outcome=state=="failed"?"failed":failed>0?"partial":"completed";
        var details=processed is {} count?UiMessage.Key("ui.taskNotifications.counts",new Dictionary<string,object?>{
            {"processed",count},{"succeeded",Math.Max(0,count-failed-skipped)},{"failed",failed},{"skipped",skipped}}):UiMessage.Literal("");
        send(UiMessage.Key("ui.taskNotifications.summary",new Dictionary<string,object?>{
            {"task",UiMessage.Key("ui.taskNotifications."+kind)},{"state",UiMessage.Key("ui.taskNotifications."+outcome)},{"details",details}}));
    }
}
