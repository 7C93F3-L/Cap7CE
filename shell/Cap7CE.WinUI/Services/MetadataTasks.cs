using Cap7CE.WinUI.Localization;
using System.Text.Json;
using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;

internal sealed class MetadataTasks(ShellServices services)
{
    private CoreConnection? attached;
    private bool started;
    private string? lastPhase;
    private string? notificationId;
    private bool multipleDirectories;
    public bool ActiveThisSession=>started&&ReferenceEquals(attached,services.Core);
    public event Action<JsonElement,MetadataTaskStatus>? Changed;
    private readonly SemaphoreSlim gate=new(1);
    public async Task<JsonElement> InvokeAsync(string operation,object? body=null,CancellationToken token=default)
    {
        var core=services.Core??throw new UiFailure("ui.error.metadataDisconnected");
        if(!core.Supports(MetadataBuildOperations.Attach))throw new UiFailure("ui.error.metadataCapability");
        await gate.WaitAsync(token);
        try {
            if(!ReferenceEquals(core,services.Core))throw new UiFailure("ui.error.connectionChanged");
            if(!ReferenceEquals(attached,core)) {
                Read(await core.RequestAsync<JsonElement>(MetadataBuildOperations.Attach,new{},token));attached=core;started=false;lastPhase=null;
                if(notificationId is {} old)services.TaskNotices.Forget("metadata",old);notificationId=null;
            }
        var result=Read(await core.RequestAsync<JsonElement>("metadata.build."+operation,body??new{},token,30000));
        token.ThrowIfCancellationRequested();
        if(!ReferenceEquals(core,services.Core))throw new UiFailure("ui.error.metadataConnection");
        if(operation is "start" or "startDirectory" or "startAllVolumes" or "resume"){
            started=true;if(notificationId is null){multipleDirectories=false;notificationId=Guid.NewGuid().ToString("N");services.TaskNotices.Begin("metadata",notificationId);}
        }
        if(operation is "pause" or "cancelDirectories" or "shutdown"){
            started=false;if(notificationId is {} cancelled)services.TaskNotices.Forget("metadata",cancelled);notificationId=null;
        }
        if(result.TryGetProperty("progress",out var progress)) {
            var phase=progress.GetProperty("phase").GetString();
            var pending=MetadataPanelState.Read(result).Pending;multipleDirectories|=pending>1;
            var state=MetadataTaskStatus.Read(result,started,operation);
            if(phase=="completed"&&pending>0)state=state with{Phase="waiting"};
            if(started&&state.Phase=="completed"&&lastPhase!="completed")services.RefreshViews();lastPhase=state.Phase;
            if(notificationId is {} id&&state.Phase is "completed" or "failed"){
                services.TaskNotices.Finish("metadata",id,state.Phase,multipleDirectories?null:state.Processed,state.Failed,state.Unsupported);notificationId=null;
            }
            Changed?.Invoke(result,state);
        }
        return result;
        } finally{gate.Release();}
    }
    public async Task NotifyAsync()
    {if(started&&ReferenceEquals(attached,services.Core))await InvokeAsync("notify");}
    private static JsonElement Read(JsonElement reply)
    {
        if(reply.TryGetProperty("errorCode",out var error)&&error.ValueKind==JsonValueKind.String)throw new IOException(error.GetString());
        return reply.GetProperty("result").Clone();
    }
}
