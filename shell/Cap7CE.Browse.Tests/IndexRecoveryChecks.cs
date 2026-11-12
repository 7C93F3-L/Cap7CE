using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
internal static class IndexRecoveryChecks
{
    public static async Task RunAsync()
    {
        void Check(bool value,string message){if(!value)throw new Exception(message);}
        var ready=new CoreVolumeStatus("c","C:\\","NTFS",true,"ready",100,null,true,false);
        var stale=ready with{VolumeId="d",DisplayName="D:\\",State="needsRebuild",NeedsRebuild=true,Queryable=false};
        var status=new CatalogStatusResponse([ready,stale],[],1);
        Check(IndexRecoveryPolicy.Evaluate(status,"watching") is {Kind:"incomplete",CanRetry:true,VolumeIds:["d"]},"A selected incomplete index remains visible even while other drives are watched");
        Check(IndexRecoveryPolicy.Evaluate(status with{Volumes=[ready]},"failed") is {Kind:"failed",VolumeIds:["c"]},"Stopped maintenance is visible even when the last published index still appears ready");
        Check(IndexRecoveryPolicy.Evaluate(status with{Volumes=[ready with{State="catchingUp"}]},"failed") is {Kind:"failed"},"A failed monitor cannot hide indefinitely behind a stale catching-up state");
        Check(IndexRecoveryPolicy.Evaluate(status,"unavailable") is {CanRetry:false},"Unsupported readers require settings rather than repeating the same build");
        foreach(var state in new[]{"starting","paused"})Check(IndexRecoveryPolicy.Evaluate(status,state) is null,"Automatic preparation and an intentional pause do not raise a failure warning");
        Check(IndexRecoveryPolicy.Evaluate(status with{Tasks=[new("task","build","running",null)]},"failed") is null,"Existing work suppresses another retry prompt");
        Check(IndexRecoveryPolicy.Evaluate(status with{Volumes=[stale with{Selected=false}]},"failed") is null,"Disabled volumes do not require recovery");
        Check(IndexRecoveryPolicy.Evaluate(status with{Volumes=[ready]},"watching") is null,"Healthy maintenance clears the warning");
        Check(IndexRecoveryPolicy.Evaluate(status,"failed")!.Key==IndexRecoveryPolicy.Evaluate(status with{Volumes=[stale,ready]},"failed")!.Key,"Row order changes do not re-open a dismissed warning");
        var service=new ShellServices{Core=new(){IndexStatus=status}};
        await IndexBuildActions.RetryAsync(service);
        var request=(CatalogBuildRequest)service.Core.Requests.Single(r=>r.Operation==CoreOperations.CatalogBuild).Body;
        Check(request.VolumeIds.SequenceEqual(new[]{"d"}),"Retry targets only the selected indexes that need recovery");
        Check(!service.Core.Requests.Any(r=>r.Operation is CoreOperations.VolumeSelection or CoreOperations.CatalogRebuild),"Recovery never changes disk selection or requests a forced rebuild");
        var running=new ShellServices{Core=new(){IndexStatus=status with{Tasks=[new("task","build","running",null)]}}};
        await IndexBuildActions.RetryAsync(running);Check(!running.Core.Requests.Any(r=>r.Operation==CoreOperations.CatalogBuild),"The retry action rechecks running tasks before starting work");
        var stopped=new ShellServices{Core=new(){IndexStatus=status with{Volumes=[ready]}},CatalogMaintenance=new(1,1,"failed","reader-monitor-failed",true)};
        await IndexBuildActions.RetryAsync(stopped);Check(stopped.Core.Requests.Any(r=>r.Operation==CoreOperations.CatalogBuild),"Stopped maintenance can resume through the existing normal update action");
        var core=new CoreConnection();core.ChangeNotices.Enqueue(new(1,0,"failed","reader-monitor-failed",false));
        core.ChangeNotices.Enqueue(new(1,0,"failed","reader-monitor-failed",false));core.ChangeNotices.Enqueue(new(2,0,"watching",null,true));
        var states=new List<string>();var changed=0;var completed=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using(var subscription=new CatalogChangeSubscription(core,_=>{changed++;completed.TrySetResult();return Task.CompletedTask;},e=>completed.TrySetException(e),n=>states.Add(n.State))){
            await completed.Task.WaitAsync(TimeSpan.FromSeconds(2));
            Check(states.SequenceEqual(new[]{"failed","watching"})&&changed==1,"Initial maintenance failure is delivered once without treating the initial snapshot as a catalog refresh");
        }
        Console.WriteLine("Index recovery visibility, suppression, stable identity, safe retry scope and unchanged disk selection checks passed.");
    }
}
