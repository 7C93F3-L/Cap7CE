using System.Diagnostics;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using Cap7CE.Core.Protocol;
using Microsoft.Win32.SafeHandles;

namespace Cap7CE.WinUI.Services;
internal sealed class CoreConnection : IAsyncDisposable
{
    private readonly Process process;
    private readonly FramedRpc rpc;
    private long sequence;
    public IReadOnlyList<string> Capabilities {get;private set;}=[];
    public bool IsConnected=>rpc.IsConnected;
    public bool Supports(string operation)=>Capabilities.Contains(operation,StringComparer.Ordinal);
    private CoreConnection(Process process, NamedPipeClientStream pipe) { this.process = process; rpc = new(pipe, pipe, CoreProtocol.MaximumFrameBytes); }
    public static Task<CoreConnection> StartAsync(string root, string database, bool interactive = false,bool product=false,Action<string>? failureLog=null)
        =>StartAsync(CoreLaunchProfile.Create(root,database,product,interactive),failureLog);
    internal static async Task<CoreConnection> StartAsync(CoreLaunchProfile profile,Action<string>? failureLog=null)
    {
        var name=profile.Pipe;var info=profile.Start;
        var child = Process.Start(info) ?? throw new IOException("无法启动 Core 查询宿主");
        var lastError="";child.ErrorDataReceived += (_, e) => {if(e.Data is {} text)lastError=text;}; child.BeginErrorReadLine();
        var pipe = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        CoreConnection? connection = null;
        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
            var secret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
            await child.StandardInput.WriteLineAsync(secret);
            if (!profile.IsReady(await child.StandardOutput.ReadLineAsync(timeout.Token),child.Id)) throw new IOException("Core启动失败。请关闭其他Cap7CE进程后重试；索引权限和安装状态可在设置中查看。");
            await pipe.ConnectAsync(timeout.Token);
            if (!GetNamedPipeServerProcessId(pipe.SafePipeHandle, out var pid) || pid != child.Id) throw new IOException("Core 进程身份不符");
            connection = new(child, pipe);
            var hello = await connection.RequestAsync<SessionHelloResponse>(CoreOperations.SessionHello,
                new SessionHelloRequest(secret, [1], "Cap7CE WinUI Phase F", "1.0.4", Environment.ProcessId), timeout.Token);
            if (hello.ServerProcessId != child.Id || hello.SelectedProtocolVersion != 1 || hello.SyntheticFixture
                || !hello.Capabilities.Contains(CoreOperations.SearchStart)) throw new IOException("Core 协商失败");
            connection.Capabilities=hello.Capabilities;return connection;
        }
        catch(Exception error)
        {
            try{failureLog?.Invoke(lastError+"\n"+error);}catch{}
            if (connection is not null) await connection.DisposeAsync();
            else { pipe.Dispose(); child.StandardInput.Close(); if (!child.HasExited) child.Kill(true); child.Dispose(); }
            throw;
        }
    }
    public async Task<T> RequestAsync<T>(string operation, object body, CancellationToken token = default,int deadlineMs=15000)
    {
        var id = "winui-" + Interlocked.Increment(ref sequence);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromMilliseconds(deadlineMs+1000));
        using var registration = token.Register(() => { if (operation.StartsWith("search.") && operation != CoreOperations.SearchCancel) _ = CancelAsync(id); });
        JsonElement value;
        try{value=await rpc.RequestAsync(id,new{protocolVersion=1,requestId=id,operation,deadlineMs,body},timeout.Token);}
        catch(OperationCanceledException)when(!token.IsCancellationRequested)
        {throw new IOException(IsConnected?"查询超时，请重试。":"查询连接已断开，请重新连接后重试。");}
        if (value.GetProperty("status").GetString() != "success")
            throw new IOException(value.GetProperty("error").GetProperty("code").GetString());
        return value.GetProperty("body").Deserialize<T>(FramedRpc.Json) ?? throw new IOException("Core 响应为空");
    }
    private async Task CancelAsync(string id) { try { await RequestAsync<SearchCancelResponse>(CoreOperations.SearchCancel, new SearchCancelRequest(id)); } catch { } }
    public async ValueTask DisposeAsync()
    {
        if(Supports(CoreOperations.CoreShutdown))try{await RequestAsync<CoreShutdownResponse>(CoreOperations.CoreShutdown,new{},deadlineMs:5000);}catch{}
        process.StandardInput.Close(); await rpc.DisposeAsync();
        try { await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5)); }
        catch (TimeoutException) { if (!process.HasExited) process.Kill(true); }
        process.Dispose();
    }
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetNamedPipeServerProcessId(SafePipeHandle pipe, out uint processId);
}
