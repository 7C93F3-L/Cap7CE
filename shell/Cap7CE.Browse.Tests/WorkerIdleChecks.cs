using Cap7CE.WinUI.Services;
internal static class WorkerIdleChecks
{
    public static async Task RunAsync()
    {
        if(!WorkerIdleLifetime.IsAtomic("office-preview.cjs","cache.stats"))throw new Exception("Office stats cannot retire");
        foreach(var method in new[]{"office.prepare","cache.acquire","cache.release","cache.clear","releaseSourceHandles","unknown"})
            if(WorkerIdleLifetime.IsAtomic("office-preview.cjs",method))throw new Exception("Office session or lease classified as atomic");
        if(WorkerIdleLifetime.IsAtomic("provider-preview.cjs","cache.stats")||WorkerIdleLifetime.IsAtomic("model-runtime.cjs","cache.stats"))throw new Exception("unrelated host retirement enabled");
        foreach(var operation in new[]{"runtime.settings","models.settings"})
            if(!WorkerIdleLifetime.IsAtomic("model-runtime.cjs","modelSettings.invoke",[new{},operation,null]))throw new Exception("model configuration query cannot retire");
        foreach(var operation in new[]{"runtime.select","models.select","models.selectedId","models.selectedRuntime","unknown"})
            if(WorkerIdleLifetime.IsAtomic("model-runtime.cjs","modelSettings.invoke",[new{},operation,null]))throw new Exception("model mutation or unknown operation can retire");
        if(!WorkerIdleLifetime.IsAtomic("model-runtime.cjs","runtime.state",[new{},null]))throw new Exception("cold runtime state cannot retire");
        foreach(var operation in new[]{"runtime.watch","runtime.shutdown","unknown"})
            if(WorkerIdleLifetime.IsAtomic("model-runtime.cjs",operation,[new{},null]))throw new Exception("model service lifecycle can retire");
        foreach(var operation in new[]{"runtime.select","models.select"})
            if(!WorkerIdleLifetime.IsAtomic("model-runtime.cjs","modelSettings.invoke",[new{},operation,"fixture"]))throw new Exception("persisted selection cannot enter domain retirement check");
        var checks=0;var checkedTwice=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var retrying=new WorkerIdleLifetime(()=>{if(++checks==2)checkedTwice.TrySetResult();return Task.CompletedTask;},TimeSpan.FromMilliseconds(20),_=>{},()=>checks<2);
        await retrying.EnterAsync(true);await retrying.LeaveAsync(true);await checkedTwice.Task.WaitAsync(TimeSpan.FromSeconds(2));
        await retrying.CloseAsync();var stoppedChecks=checks;await Task.Delay(80);if(checks!=stoppedChecks)throw new Exception("closed idle coordinator retried");
        var retired=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);var count=0;
        var lifetime=new WorkerIdleLifetime(()=>{Interlocked.Increment(ref count);retired.TrySetResult();return Task.CompletedTask;},TimeSpan.FromMilliseconds(30),e=>throw new Exception("retire failed",e));
        await lifetime.EnterAsync(true);await lifetime.EnterAsync(true);await lifetime.LeaveAsync(true);
        await Task.Delay(80);if(count!=0)throw new Exception("active request retired");
        await lifetime.LeaveAsync(true);await retired.Task.WaitAsync(TimeSpan.FromSeconds(2));
        await lifetime.EnterAsync(false);await lifetime.LeaveAsync(true);await Task.Delay(80);
        if(count!=1)throw new Exception("session request retired");
        await lifetime.CloseAsync();await lifetime.CloseAsync();if(count!=2)throw new Exception("duplicate close");
        try{await lifetime.EnterAsync(true);throw new Exception("closed lifetime accepted request");}catch(ObjectDisposedException){}
        var started=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);var finish=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var blocked=new WorkerIdleLifetime(async()=>{started.TrySetResult();await finish.Task;},TimeSpan.FromMilliseconds(20),_=>{});
        await blocked.EnterAsync(true);await blocked.LeaveAsync(true);await started.Task.WaitAsync(TimeSpan.FromSeconds(2));
        var next=blocked.EnterAsync(true);await Task.Delay(30);if(next.IsCompleted)throw new Exception("request raced retirement");
        finish.SetResult();await next;await blocked.LeaveAsync(false);await blocked.CloseAsync();
        var officeCount=0;
        var office=new WorkerIdleLifetime(()=>{officeCount++;return Task.CompletedTask;},TimeSpan.FromMilliseconds(20),_=>{});
        await office.EnterAsync(WorkerIdleLifetime.IsAtomic("office-preview.cjs","cache.acquire"));await office.LeaveAsync(true);
        await office.EnterAsync(WorkerIdleLifetime.IsAtomic("office-preview.cjs","cache.stats"));await office.LeaveAsync(true);
        await Task.Delay(80);if(officeCount!=0)throw new Exception("stats re-enabled retirement after Office session");
        await office.CloseAsync();
        var modelCount=0;
        var model=new WorkerIdleLifetime(()=>{modelCount++;return Task.CompletedTask;},TimeSpan.FromMilliseconds(20),_=>{});
        await model.EnterAsync(WorkerIdleLifetime.IsAtomic("model-runtime.cjs","runtime.watch",[new{},new{}]));await model.LeaveAsync(true);
        await model.EnterAsync(WorkerIdleLifetime.IsAtomic("model-runtime.cjs","runtime.state",[new{},null]));await model.LeaveAsync(true);
        await Task.Delay(80);if(modelCount!=0)throw new Exception("state query re-enabled model retirement after subscription");
        await model.CloseAsync();
    }
}
