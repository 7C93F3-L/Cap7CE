using Cap7CE.WinUI.Localization;
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
    private readonly CoreProcessDiagnostics diagnostics;
    private readonly CoreRequestSender sender=new();
    public IReadOnlyList<string> Capabilities {get;private set;}=[];
    public bool IsConnected=>rpc.IsConnected;
    public bool Supports(string operation)=>Capabilities.Contains(operation,StringComparer.Ordinal);
    private CoreConnection(Process process, NamedPipeClientStream pipe,CoreProcessDiagnostics diagnostics) { this.process = process;this.diagnostics=diagnostics; rpc = new(pipe, pipe, CoreProtocol.MaximumFrameBytes); }
    public static Task<CoreConnection> StartAsync(string root, string database, bool interactive = false,bool product=false,Action<string>? failureLog=null,Action<string>? runtimeLog=null)
        =>StartAsync(CoreLaunchProfile.Create(root,database,product,interactive),failureLog,runtimeLog);
    internal static async Task<CoreConnection> StartAsync(CoreLaunchProfile profile,Action<string>? failureLog=null,Action<string>? runtimeLog=null)
    {
        var name=profile.Pipe;var info=profile.Start;
        var child = Process.Start(info) ?? throw new UiFailure("ui.error.coreStart");
        var diagnostics=new CoreProcessDiagnostics(child,runtimeLog??failureLog??(_=>{}));
        var pipe = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        CoreConnection? connection = null;
        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
            var secret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
            await child.StandardInput.WriteLineAsync(secret);
            if (!profile.IsReady(await child.StandardOutput.ReadLineAsync(timeout.Token),child.Id)) throw new UiFailure("ui.error.coreStartup");
            await pipe.ConnectAsync(timeout.Token);
            if (!GetNamedPipeServerProcessId(pipe.SafePipeHandle, out var pid) || pid != child.Id) throw new UiFailure("ui.error.coreIdentity");
            connection = new(child, pipe,diagnostics);
            var hello = await connection.RequestAsync<SessionHelloResponse>(CoreOperations.SessionHello,
                new SessionHelloRequest(secret, [1], "Cap7CE WinUI Phase F", "1.0.4", Environment.ProcessId), timeout.Token);
            if (hello.ServerProcessId != child.Id || hello.SelectedProtocolVersion != 1 || hello.SyntheticFixture
                || !hello.Capabilities.Contains(CoreOperations.SearchStart)) throw new UiFailure("ui.error.coreHandshake");
            connection.Capabilities=hello.Capabilities;return connection;
        }
        catch(Exception error)
        {
            diagnostics.ExpectExit();
            try{failureLog?.Invoke(diagnostics.Errors+"\n"+error);}catch{}
            if (connection is not null) await connection.DisposeAsync();
            else { pipe.Dispose(); child.StandardInput.Close(); if (!child.HasExited) child.Kill(true);await diagnostics.Completion; child.Dispose(); }
            throw;
        }
    }
    public async Task<T> RequestAsync<T>(string operation, object body, CancellationToken token = default,int deadlineMs=15000)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromMilliseconds(deadlineMs+1000));
        var pending=await sender.StartAsync(id=>rpc.RequestAsync(id,new{protocolVersion=1,requestId=id,operation,deadlineMs,body},timeout.Token),timeout.Token);
        using var registration = token.Register(() => { if (operation.StartsWith("search.") && operation != CoreOperations.SearchCancel) _ = CancelAsync(pending.Id); });
        JsonElement value;
        try{value=await pending.Response;}
        catch(OperationCanceledException)when(!token.IsCancellationRequested)
        {throw new UiFailure(IsConnected?"ui.error.coreTimeout":"ui.error.coreDisconnected");}
        if (value.GetProperty("status").GetString() != "success")
            throw new IOException(value.GetProperty("error").GetProperty("code").GetString());
        return value.GetProperty("body").Deserialize<T>(FramedRpc.Json) ?? throw new UiFailure("ui.error.coreEmpty");
    }
    private async Task CancelAsync(string id) { try { await RequestAsync<SearchCancelResponse>(CoreOperations.SearchCancel, new SearchCancelRequest(id)); } catch { } }
    public async ValueTask DisposeAsync()
    {
        diagnostics.ExpectExit();
        if(Supports(CoreOperations.CoreShutdown))try{await RequestAsync<CoreShutdownResponse>(CoreOperations.CoreShutdown,new{},deadlineMs:5000);}catch{}
        process.StandardInput.Close(); await rpc.DisposeAsync();
        try { await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5)); }
        catch (TimeoutException) { if (!process.HasExited) process.Kill(true); }
        await diagnostics.Completion;process.Dispose();
    }
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetNamedPipeServerProcessId(SafePipeHandle pipe, out uint processId);
}
