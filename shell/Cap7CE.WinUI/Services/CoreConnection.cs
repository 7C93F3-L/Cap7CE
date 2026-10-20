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
    private CoreConnection(Process process, NamedPipeClientStream pipe) { this.process = process; rpc = new(pipe, pipe, CoreProtocol.MaximumFrameBytes); }
    public static async Task<CoreConnection> StartAsync(string root, string database, bool interactive = false)
    {
        var name = "cap7ce-phase-f-" + Guid.NewGuid().ToString("N");
        var info = new ProcessStartInfo(Path.Combine(root, "shell/artifacts/query/Cap7CE.QueryHost.exe")) {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
            RedirectStandardOutput = true, RedirectStandardError = true
        };
        foreach (var arg in new[] { "--pipe-name", name, "--catalog", database }) info.ArgumentList.Add(arg);
        if (interactive) info.ArgumentList.Add("--interactive");
        var child = Process.Start(info) ?? throw new IOException("无法启动 Core 查询宿主");
        child.ErrorDataReceived += (_, _) => { }; child.BeginErrorReadLine();
        var pipe = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        CoreConnection? connection = null;
        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
            var secret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
            await child.StandardInput.WriteLineAsync(secret);
            if (await child.StandardOutput.ReadLineAsync(timeout.Token) != "ready") throw new IOException("现有 Catalog 不可用；请先用 Electron 建立目录");
            await pipe.ConnectAsync(timeout.Token);
            if (!GetNamedPipeServerProcessId(pipe.SafePipeHandle, out var pid) || pid != child.Id) throw new IOException("Core 进程身份不符");
            connection = new(child, pipe);
            var hello = await connection.RequestAsync<SessionHelloResponse>(CoreOperations.SessionHello,
                new SessionHelloRequest(secret, [1], "Cap7CE WinUI Phase F", "1.0.4", Environment.ProcessId), timeout.Token);
            if (hello.ServerProcessId != child.Id || hello.SelectedProtocolVersion != 1 || hello.SyntheticFixture
                || !hello.Capabilities.Contains(CoreOperations.SearchStart)) throw new IOException("Core 协商失败");
            return connection;
        }
        catch
        {
            if (connection is not null) await connection.DisposeAsync();
            else { pipe.Dispose(); child.StandardInput.Close(); if (!child.HasExited) child.Kill(true); child.Dispose(); }
            throw;
        }
    }
    public async Task<T> RequestAsync<T>(string operation, object body, CancellationToken token = default)
    {
        var id = "winui-" + Interlocked.Increment(ref sequence);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(16));
        using var registration = token.Register(() => { if (operation.StartsWith("search.") && operation != CoreOperations.SearchCancel) _ = CancelAsync(id); });
        var value = await rpc.RequestAsync(id, new { protocolVersion = 1, requestId = id, operation, deadlineMs = 15000, body }, timeout.Token);
        if (value.GetProperty("status").GetString() != "success")
            throw new IOException(value.GetProperty("error").GetProperty("code").GetString());
        return value.GetProperty("body").Deserialize<T>(FramedRpc.Json) ?? throw new IOException("Core 响应为空");
    }
    private async Task CancelAsync(string id) { try { await RequestAsync<SearchCancelResponse>(CoreOperations.SearchCancel, new SearchCancelRequest(id)); } catch { } }
    public async ValueTask DisposeAsync()
    {
        process.StandardInput.Close(); await rpc.DisposeAsync();
        try { await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5)); }
        catch (TimeoutException) { if (!process.HasExited) process.Kill(true); }
        process.Dispose();
    }
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetNamedPipeServerProcessId(SafePipeHandle pipe, out uint processId);
}
