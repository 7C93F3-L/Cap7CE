using Cap7CE.WinUI.Localization;
using System.Diagnostics;
using System.Text.Json;

namespace Cap7CE.WinUI.Services;

internal sealed record NativeUpdateState(string Status = "idle", string? Version = null,
    long ReceivedBytes = 0, long TotalBytes = 0, double Percent = 0, bool Busy = false, string? Error = null);

// One session owner for settings and tray. Poll only while a download is active.
internal sealed class NativeUpdates : IAsyncDisposable
{
    private readonly CoreNodeHost host;
    private readonly CancellationTokenSource lifetime = new();
    private Task<JsonElement>? initialized;
    private Task? observing;
    private bool closed;
    public bool CanInstall { get; }
    public bool Busy { get; private set; }
    public NativeUpdateState State { get; private set; } = new();
    public UiMessage? Message { get; private set; }
    public event Action? Changed;
    public event Action? InstallerStarted;
    public NativeUpdates(string root)
    {
        host = new(root, "application-updates.cjs", Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Cap7CE/updates/winui"));
        CanInstall = File.Exists(Path.Combine(root, "cap7ce-native.json"));
    }
    private Task<JsonElement> Initialize() => initialized ??= host.RequestAsync("initialize", [NativeVersion.Text], lifetime.Token);
    public async Task LoadAsync() { await Initialize(); SetState(await host.RequestAsync("state", [], lifetime.Token)); }
    private void SetState(JsonElement value)
    {
        State = value.Deserialize<NativeUpdateState>(FramedRpc.Json) ?? new();
        if (State.Error is {} error && error != "cancelled") {
            Message = UiMessage.Key(error switch { "network" => "settings.updateNetworkFailed", "disk_space" => "settings.updateDiskSpaceFailed", "rate_limited" => "settings.updateRateLimited", "invalid" => "settings.updateInvalid", _ => "settings.updateDownloadFailed" });
            SessionDiagnostics.Record("update.download.error", new { code = error });
        }
        Changed?.Invoke();
    }
    private async Task RunAsync(Func<Task> action)
    {
        if (Busy || closed) return;
        Busy = true; Changed?.Invoke();
        try { await Initialize(); await action(); }
        catch (OperationCanceledException) when (closed) { }
        catch (Exception error) { NativeDiagnostics.CoreFailure(error.ToString()); Message = error is IUiFailure ? FailureText.From(error) : UiMessage.Key("settings.updateDownloadFailed"); }
        finally { Busy = false; if (!closed) Changed?.Invoke(); }
    }
    public Task CheckAsync() => RunAsync(async () => {
        if (State.Busy) return;
        Message = UiMessage.Key("settings.updateChecking"); Changed?.Invoke();
        var reply = await host.RequestAsync("check", [], lifetime.Token);
        if (reply.TryGetProperty("downloadState", out var state)) SetState(state);
        var status = reply.GetProperty("status").GetString();
        var version = reply.TryGetProperty("latestVersion", out var latest) ? latest.GetString() : null;
        Message = status switch {
            "update_available" => UiMessage.Key("settings.updateAvailable", new Dictionary<string, object?> { ["version"] = version }),
            "up_to_date" => UiMessage.Key("settings.updateUpToDate", new Dictionary<string, object?> { ["version"] = NativeVersion.Text }),
            "busy" => null,
            _ => UiMessage.Key(reply.TryGetProperty("reason", out var reason) && reason.GetString() == "no_native_release" ? "ui.update.noNativeRelease" : "settings.updateCheckFailed")
        };
    });
    public async Task<AutomaticUpdateResult> CheckQuietlyAsync(CancellationToken token)
    {
        if(Busy||closed||State.Busy)return new(false);
        Busy=true;Changed?.Invoke();
        using var cancel=CancellationTokenSource.CreateLinkedTokenSource(token,lifetime.Token);
        try {
            await Initialize();cancel.Token.ThrowIfCancellationRequested();
            var reply=await host.RequestAsync("check",[],cancel.Token);
            var status=reply.GetProperty("status").GetString();
            if(status is not ("update_available" or "up_to_date"))return new(false);
            if(reply.TryGetProperty("downloadState",out var state))SetState(state);
            var version=status=="update_available"?reply.GetProperty("latestVersion").GetString():null;
            Message=version is null?UiMessage.Key("settings.updateUpToDate",new Dictionary<string,object?>{{"version",NativeVersion.Text}})
                :UiMessage.Key("settings.updateAvailable",new Dictionary<string,object?>{{"version",version}});
            return new(true,version);
        }catch(Exception){return new(false);}
        finally{Busy=false;if(!closed)Changed?.Invoke();}
    }
    public Task DownloadAsync() => RunAsync(async () => {
        Message = null; SetState(await host.RequestAsync("download", [], lifetime.Token));
        if (observing is null || observing.IsCompleted) observing = ObserveAsync();
    });
    public Task PauseAsync() => RunAsync(async () => { SetState(await host.RequestAsync("pause", [], lifetime.Token)); });
    private async Task ObserveAsync()
    {
        try {
            while (State.Busy && !closed) {
                await Task.Delay(400, lifetime.Token);
                SetState(await host.RequestAsync("state", [], lifetime.Token));
            }
        } catch (OperationCanceledException) when (closed) { }
        catch (Exception error) { NativeDiagnostics.CoreFailure(error.ToString()); Message = UiMessage.Key("settings.updateDownloadFailed"); State = State with { Busy = false }; if (!closed) Changed?.Invoke(); }
    }
    public Task InstallAsync() => RunAsync(async () => {
        if (!CanInstall) throw new UiFailure("settings.updateUnsupported");
        if (State.Status != "ready" || State.Busy) return;
        var reply = await host.RequestAsync("installer", [], lifetime.Token);
        if (reply.GetProperty("status").GetString() != "installing" || !reply.TryGetProperty("installer", out var path)) throw new UiFailure("settings.updateInstallerOpenFailed");
        try {
            Process.Start(new ProcessStartInfo(path.GetString()!) { UseShellExecute = true });
        } catch (Exception error) { NativeDiagnostics.CoreFailure(error.ToString()); Message = UiMessage.Key("settings.updateInstallerOpenFailed"); return; }
        InstallerStarted?.Invoke();
    });
    public async ValueTask DisposeAsync()
    {
        closed = true; lifetime.Cancel();
        if (observing is not null) try { await observing; } catch { }
        await host.DisposeAsync(); lifetime.Dispose();
    }
}
