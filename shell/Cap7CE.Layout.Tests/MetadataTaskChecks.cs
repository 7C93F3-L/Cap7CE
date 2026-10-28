using System.Text.Json;
using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Localization;

internal static class MetadataTaskChecks
{
    public static async Task RunAsync()
    {
        void Require(bool value,string message){if(!value)throw new Exception(message);}
        var services=new ShellServices();var core=services.Core!;var tasks=new MetadataTasks(services);
        var states=new List<MetadataTaskStatus>();tasks.Changed+=(_,state)=>states.Add(state);
        await tasks.InvokeAsync("status");
        Require(!states[^1].Running&&!tasks.ActiveThisSession,"Reading status must not claim or start extraction");
        await tasks.InvokeAsync("startDirectory",new{path="E:\\assets",allowMetadataExtraction=true});
        Require(states[^1].Running&&tasks.ActiveThisSession,"Explicit directory start publishes running state");
        var body=JsonSerializer.SerializeToElement(core.Requests.Last().Body);
        Require(body.GetProperty("path").GetString()=="E:\\assets"&&body.GetProperty("allowMetadataExtraction").GetBoolean(),"Directory scope and explicit consent must reach the existing operation");
        core.Phase="extracting";await tasks.InvokeAsync("status");
        Require(states[^1] is {Processed:4,Total:10,Fraction:.4}&&states[^1].Running,"Status exposes real counters and ratio");
        services.NotificationClock=TimeSpan.FromSeconds(20);
        core.Phase="completed";await tasks.InvokeAsync("status");await tasks.InvokeAsync("status");
        Require(!states[^1].Running&&services.Notices.Count==1&&services.Refreshes==1,"Completion refresh and notification occur once");
        var beforeWake=states.Count;await tasks.NotifyAsync();
        Require(core.Requests.Last().Operation=="metadata.build.notify","Completion preserves existing incremental maintenance ownership");
        Require(states.Count==beforeWake,"Accepted-only wake responses cannot be parsed as progress or emit false state changes");
        core.Phase="extracting";await tasks.InvokeAsync("resume");await tasks.InvokeAsync("pause");
        Require(!tasks.ActiveThisSession&&!states[^1].Running&&states[^1].Phase=="paused","Pause stops active observation");
        await tasks.InvokeAsync("cancelDirectories");
        Require(!states[^1].Running&&states[^1].Operation=="cancelDirectories","Directory cancellation cannot report completion");
        var before=states.Count;core.Fail=true;
        try{await tasks.InvokeAsync("startDirectory");throw new Exception("Failure expected");}catch(IOException){}
        Require(states.Count==before,"Rejected start cannot publish running or successful state");
        core.Fail=false;
        var blocked=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var entered=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        core.BlockStart=async()=>{entered.SetResult();await blocked.Task;};
        var start=tasks.InvokeAsync("startDirectory");await entered.Task.WaitAsync(TimeSpan.FromSeconds(2));
        var count=core.Requests.Count;var pause=tasks.InvokeAsync("pause");
        Require(core.Requests.Count==count,"Control operations must serialize behind in-flight start");
        blocked.SetResult();await Task.WhenAll(start,pause).WaitAsync(TimeSpan.FromSeconds(2));
        Require(states[^1].Operation=="pause"&&!states[^1].Running,"Late start response cannot overwrite a subsequent pause");
        core.BlockStart=null;await tasks.InvokeAsync("startDirectory");core.Pending=2;core.Phase="completed";
        await tasks.InvokeAsync("status");Require(states[^1].Running&&states[^1].Phase=="waiting","A completed directory with a pending queue must continue observation.");
        core.Pending=0;core.Phase="failed";await tasks.InvokeAsync("status");var failureNotices=services.Notices.Count;
        await tasks.InvokeAsync("status");Require(services.Notices.Count==failureNotices&&failureNotices==2,"A directory queue failure must notify once independently of the settings page.");
        Require(!services.Notices[^1].Render(AppLanguage.Session).Contains("已处理"),"Per-directory counters must not be represented as a whole-queue total.");
        var failed=MetadataTaskStatus.Read(JsonSerializer.SerializeToElement(new{progress=new{phase="failed",processed=4,failed=2,unsupported=3,errorCode="storage-error"}}),true,"status");
        Require(!failed.Running&&failed.Fraction is null&&failed.ErrorCode=="storage-error","Unknown totals and failures remain explicit");
        var discovering=MetadataTaskStatus.Read(JsonSerializer.SerializeToElement(new{progress=new{phase="discovering",discovered=120}}),true,"status");
        Require(discovering.Running&&discovering.Phase=="discovering"&&discovering.Discovered==120&&discovering.Total is null,"Discovery reports its own count rather than pretending extraction has stalled at zero");
        Console.WriteLine("Metadata task checks passed: scope, consent, progress, completion, maintenance, pause, cancellation, rejected start and serialized controls.");
    }
}

namespace Cap7CE.WinUI.Services
{
    internal sealed class ShellServices
    {
        public CoreConnection? Core {get;set;}=new();
        public TaskNotifications TaskNotices {get;}
        public TimeSpan NotificationClock {get;set;}
        public ShellServices(){TaskNotices=new(Notify,()=>NotificationClock);}
        public List<UiMessage> Notices {get;}=[];
        public int Refreshes {get;private set;}
        public void Notify(UiMessage text)=>Notices.Add(text);
        public void RefreshViews()=>Refreshes++;
    }
    internal sealed class CoreConnection
    {
        public string Phase {get;set;}="idle";
        public bool Fail {get;set;}
        public int Pending {get;set;}
        public Func<Task>? BlockStart {get;set;}
        public List<(string Operation,object Body)> Requests {get;}=[];
        public bool Supports(string operation)=>operation==MetadataBuildOperations.Attach;
        public async Task<T> RequestAsync<T>(string operation,object body,CancellationToken token=default,int deadlineMs=30000)
        {
            token.ThrowIfCancellationRequested();Requests.Add((operation,body));
            if(operation=="metadata.build.notify")return (T)(object)JsonSerializer.SerializeToElement(new{result=new{accepted=true}});
            if(operation=="metadata.build.startDirectory") {if(BlockStart is not null)await BlockStart();Phase="preparing";}
            if(operation=="metadata.build.pause")Phase="paused";
            if(operation=="metadata.build.cancelDirectories")Phase="idle";
            object reply=Fail?JsonSerializer.SerializeToElement(new{errorCode="rejected"}):JsonSerializer.SerializeToElement(new{result=new{directoryTask=new{pending=Pending},progress=new{phase=Phase,processed=4,total=10,failed=0,unsupported=0,progressFraction=.4}}});
            return (T)reply;
        }
    }
}
