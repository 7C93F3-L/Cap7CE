using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;

namespace Cap7CE.WinUI.Controllers;

internal sealed class CatalogHealthController : IDisposable
{
    private readonly Window window;
    private readonly ShellServices services;
    private readonly CatalogHealthRunner runner;
    private readonly HealthCheckSchedule schedule;
    private readonly DispatcherQueueTimer timer;
    private readonly CancellationTokenSource shutdown = new();
    private bool disposed;
    public CatalogHealthController(Window window, ShellServices services)
    {
        this.window = window; this.services = services;
        runner = new(services.Root, Path.Combine(PreferenceStore.DataRoot, "catalog-health.json"));
        schedule = new(runner.LastCheck());
        timer = window.DispatcherQueue.CreateTimer(); timer.IsRepeating = false; timer.Tick += Tick;
        window.Activated += Activated; window.AppWindow.Changed += Changed;
        services.ConnectionChanged += ConnectionChanged;
    }
    private bool Eligible => !disposed && services.Core?.IsConnected == true
        && Environment.GetEnvironmentVariable("CAP7CE_PHASEF_CATALOG") is null
        && (!window.AppWindow.IsVisible
            || window.AppWindow.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Minimized }
            || !NativeCaptionFeedback.IsActive(WinRT.Interop.WindowNative.GetWindowHandle(window)));
    private void Activated(object sender, WindowActivatedEventArgs args) => Update();
    private void Changed(AppWindow sender, AppWindowChangedEventArgs args) => Update();
    private void ConnectionChanged() => window.DispatcherQueue.TryEnqueue(Update);
    private void Update()
    {
        timer.Stop();
        if (schedule.Delay(DateTimeOffset.UtcNow, Eligible) is not {} delay) return;
        timer.Interval = delay > TimeSpan.Zero ? delay : TimeSpan.FromMilliseconds(1);
        timer.Start();
    }
    private async void Tick(DispatcherQueueTimer sender, object args)
    {
        if (!schedule.TryStart(DateTimeOffset.UtcNow, Eligible)) { Update(); return; }
        try { await runner.RunAsync(shutdown.Token); }
        catch (OperationCanceledException) { }
        catch (Exception error) { SessionDiagnostics.Record("catalog.health.error", SessionDiagnostics.Error(error)); }
        finally { schedule.Complete(DateTimeOffset.UtcNow); if (!disposed) Update(); }
    }
    public void Dispose()
    {
        if (disposed) return; disposed = true;
        timer.Stop(); timer.Tick -= Tick; window.Activated -= Activated; window.AppWindow.Changed -= Changed;
        services.ConnectionChanged -= ConnectionChanged; shutdown.Cancel();
        shutdown.Dispose();
    }
}
