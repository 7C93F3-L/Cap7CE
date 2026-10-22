using System.Text.Json;
using Cap7CE.Core.Protocol;

namespace Cap7CE.WinUI.Services;

internal sealed class MetadataTasks(ShellServices services)
{
    private CoreConnection? attached;
    private bool started;
    private string? lastPhase;
    public bool ActiveThisSession=>started&&ReferenceEquals(attached,services.Core);
    private readonly SemaphoreSlim gate=new(1);
    public async Task<JsonElement> InvokeAsync(string operation,object? body=null,CancellationToken token=default)
    {
        var core=services.Core??throw new IOException("Core尚未连接，请先重新连接。");
        if(!core.Supports(MetadataBuildOperations.Attach))throw new IOException("当前Core未提供属性任务，请确认使用完整原生程序包。");
        await gate.WaitAsync(token);
        try {
            if(!ReferenceEquals(attached,core)) {
                Read(await core.RequestAsync<JsonElement>(MetadataBuildOperations.Attach,new{},token));attached=core;started=false;lastPhase=null;
            }
        } finally{gate.Release();}
        var result=Read(await core.RequestAsync<JsonElement>("metadata.build."+operation,body??new{},token,30000));
        token.ThrowIfCancellationRequested();
        if(!ReferenceEquals(core,services.Core))throw new IOException("Core连接已改变，请刷新任务状态。");
        if(operation is "start" or "startDirectory" or "startAllVolumes" or "resume")started=true;
        if(operation is "pause" or "cancelDirectories" or "shutdown")started=false;
        if(result.TryGetProperty("progress",out var progress)) {
            var phase=progress.GetProperty("phase").GetString();
            if(started&&phase=="completed"&&lastPhase!="completed"){services.Notify("属性提取完成。");services.RefreshViews();}lastPhase=phase;
        }
        return result;
    }
    public async Task NotifyAsync()
    {if(started&&ReferenceEquals(attached,services.Core))await InvokeAsync("notify");}
    private static JsonElement Read(JsonElement reply)
    {
        if(reply.TryGetProperty("errorCode",out var error)&&error.ValueKind==JsonValueKind.String)throw new IOException(error.GetString());
        return reply.GetProperty("result").Clone();
    }
}
