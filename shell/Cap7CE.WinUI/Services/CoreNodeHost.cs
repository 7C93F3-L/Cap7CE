using Cap7CE.WinUI.Localization;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;

namespace Cap7CE.WinUI.Services;
// Shared owner for existing Node/Job hosts: lazy startup, no automatic replay.
internal sealed class CoreNodeHost : IAsyncDisposable
{
    private readonly string root,worker,dataRoot;
    private readonly WorkerIdleLifetime lifetime;
    public CoreNodeHost(string root,string worker,string dataRoot)
    {
        this.root=root;this.worker=worker;this.dataRoot=dataRoot;
        lifetime=new(StopIdleAsync,TimeSpan.FromSeconds(60),error=>SessionDiagnostics.Record("worker.idle.failed",new{worker,type=error.GetType().Name}));
    }
    private bool Atomic(string method,object?[] args)=>WorkerIdleLifetime.IsAtomic(worker,method,args);
    private Process? process;
    private FramedRpc? rpc;
    private readonly SemaphoreSlim starting = new(1), sending = new(1);
    private readonly string nonce = Guid.NewGuid().ToString();
    private long sequence;
    private bool closed;
    private readonly Queue<string> errors=new();
    public bool HasProcess=>process is not null;
    public bool IsActive {get{try{return !closed&&process is {} owner&&!owner.HasExited;}catch(InvalidOperationException){return false;}}}
    public object Diagnostics {get{lock(errors)return new{worker,active=IsActive,stderr=errors.ToArray()};}}
    private string Executable => Path.Combine(root, "native/artifacts/core-visuals/v1/Cap7CE.Core.Visuals.exe");
    private async Task StartAsync()
    {
        await starting.WaitAsync();
        try
        {
            if (closed) throw new ObjectDisposedException(nameof(CoreNodeHost));
            if (process is not null) return;
            var directory = Path.Combine(root, "artifacts/metadata-worker/v1"); var node = Path.Combine(directory, "node.exe");
            await using var source = File.OpenRead(node);
            if (Convert.ToHexString(await SHA256.HashDataAsync(source)).ToLowerInvariant() != "3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5") throw new UiFailure("ui.error.nodeChecksum");
            var info = new ProcessStartInfo(Executable) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
                RedirectStandardOutput = true, RedirectStandardError = true, WorkingDirectory = directory };
            foreach (var key in new[] { "NODE_OPTIONS", "NODE_PATH", "ELECTRON_RUN_AS_NODE", "CAP7CE_CORE_SCRATCH_ROOT", "CAP7CE_VISUAL_SCRATCH" }) info.Environment.Remove(key);
            info.Environment["CAP7CE_CORE_VISUAL_HOST"] = Executable;
            foreach (var arg in new[] { "--node-worker", "--parent-pid", Environment.ProcessId.ToString(), node, Path.Combine(directory, worker), dataRoot, nonce }) info.ArgumentList.Add(arg);
            process = Process.Start(info) ?? throw new UiFailure("ui.error.nodeHost");
            SessionDiagnostics.Record("worker.spawned",new{worker,pid=process.Id});
            try {
                var owner=process;var pid=owner.Id;
                owner.Exited+=(_,_)=>{try{SessionDiagnostics.Record("worker.exit",new{worker,pid,owner.ExitCode});}catch{}};
                owner.EnableRaisingEvents=true;
            }catch { /* Exit observation cannot block host startup. */ }
            process.ErrorDataReceived += (_, args) => {if(args.Data is {} line)lock(errors){errors.Enqueue(line[..Math.Min(line.Length,512)]);while(errors.Count>24)errors.Dequeue();}}; process.BeginErrorReadLine();
            rpc = new(process.StandardOutput.BaseStream, process.StandardInput.BaseStream, 64 * 1024 * 1024);
        }
        finally { starting.Release(); }
    }
    public async Task<JsonElement> RequestAsync(string method, object?[] args, CancellationToken token = default)
    {
        await lifetime.EnterAsync(Atomic(method,args));var success=false;
        using var trace=worker=="model-runtime.cjs"?SessionDiagnostics.Begin("ai.request",new{method,operation=method=="modelSettings.invoke"?args.ElementAtOrDefault(1) as string:null}):null;
        try {
        await StartAsync();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token); timeout.CancelAfter(TimeSpan.FromSeconds(120));
        await sending.WaitAsync(timeout.Token);
        Task<JsonElement> response;
        try
        {
            var id = ++sequence;
            response = rpc!.RequestAsync(id.ToString(), new { version = 1, id, method, args }, timeout.Token);
        }
        finally { sending.Release(); }
        var value = await response;
        if (value.TryGetProperty("error", out var error)) {
            var failure=new IOException(error.GetProperty("code").GetString());
            if(error.TryGetProperty("message",out var message))failure.Data["CoreMessage"]=message.GetString();
            throw failure;
        }
        var result=value.GetProperty("result").Clone();success=true;return result;
        }catch(Exception error){trace?.Fail(error);throw;}
        finally{await lifetime.LeaveAsync(success);}
    }
    public async Task ReleaseAsync() { if (IsActive) await RequestAsync("releaseSourceHandles", []); }
    public async ValueTask DisposeAsync(){closed=true;await lifetime.CloseAsync();}
    private async Task StopIdleAsync()
    {
        if(!closed && worker is ("provider-preview.cjs" or "office-preview.cjs") && rpc is not null) {
            using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(120));var id=++sequence;
            var reply=await rpc.RequestAsync(id.ToString(),new{version=1,id,method="preview.idle",args=Array.Empty<object>()},timeout.Token);
            if(reply.TryGetProperty("error",out _))throw new IOException("preview-idle-failed");
            if(!reply.GetProperty("result").GetBoolean())return;
        }
        await StopAsync();
    }
    private async Task StopAsync()
    {
        await starting.WaitAsync();
        try{
        if (process is null) return;
        try
        {
            process.StandardInput.Close();
            if (!process.HasExited)
            {
                var info = new ProcessStartInfo(Executable) { UseShellExecute = false, CreateNoWindow = true };
                foreach (var arg in new[] { "--stop", process.Id.ToString(), nonce }) info.ArgumentList.Add(arg);
                using var stop = Process.Start(info);
                if (stop is not null) await stop.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5));
            }
        }
        finally
        {
            if (rpc is not null) await rpc.DisposeAsync();
            try { await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5)); }
            catch (TimeoutException) { if (!process.HasExited) process.Kill(true); }
            process.Dispose();process=null;rpc=null;
        }
        }finally{starting.Release();}
    }
}
