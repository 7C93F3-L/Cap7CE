namespace Cap7CE.Core.Host.CatalogMaintenance;

// The continuous monitor and explicit discover/select/synchronize operations
// share one owner. Cancellation is followed by awaiting its entire retirement,
// including the Reader session's async disposal, before another lease starts.
public sealed class CatalogReaderOwnership : IAsyncDisposable
{
    private readonly CatalogPreparationDiagnostics? diagnostics;
    public CatalogReaderOwnership(CatalogPreparationDiagnostics? diagnostics = null) { this.diagnostics = diagnostics; }
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly CancellationTokenSource shutdown = new();
    private Func<CancellationToken, Task>? monitor;
    private CancellationTokenSource? monitorCancellation;
    private Task? monitorTask;
    private bool stopped;
    public string? LastMonitorFailure { get; private set; }

    public async Task ActivateAsync(Func<CancellationToken, Task> monitor, CancellationToken token = default)
    {
        ArgumentNullException.ThrowIfNull(monitor);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, shutdown.Token);
        await gate.WaitAsync(linked.Token);
        try {
            if (stopped) throw new ObjectDisposedException(nameof(CatalogReaderOwnership));
            if (this.monitor is not null) throw new InvalidOperationException("reader-monitor-already-configured");
            this.monitor = monitor; StartMonitor();
        }
        finally { gate.Release(); }
    }

    public async Task<T> RunExclusiveAsync<T>(Func<CancellationToken, Task<T>> operation, CancellationToken token = default, string operationName = "explicit")
    {
        ArgumentNullException.ThrowIfNull(operation);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, shutdown.Token);
        await gate.WaitAsync(linked.Token);
        try {
            if (stopped) throw new ObjectDisposedException(nameof(CatalogReaderOwnership));
            var watch = System.Diagnostics.Stopwatch.StartNew();
            var interrupted = monitorTask is { IsCompleted: false };
            if (interrupted) diagnostics?.Write("monitor-interrupt", new { operation = operationName });
            await RetireMonitorAsync();
            if (interrupted) diagnostics?.Write("monitor-retired", new { operation = operationName, elapsedMilliseconds = watch.Elapsed.TotalMilliseconds });
            linked.Token.ThrowIfCancellationRequested();
            return await operation(linked.Token);
        }
        finally { StartMonitor(); gate.Release(); }
    }

    private void StartMonitor()
    {
        if (monitor is null || stopped || shutdown.IsCancellationRequested || monitorTask is not null) return;
        LastMonitorFailure = null;
        var cancellation = CancellationTokenSource.CreateLinkedTokenSource(shutdown.Token);
        monitorCancellation = cancellation;
        var run = monitor;
        diagnostics?.Write("monitor-started", new { });
        monitorTask = Task.Run(async () => {
            try { await run(cancellation.Token); }
            catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
            catch (Exception error) when (error is not OutOfMemoryException) {
                // A failed monitor stays stopped until a meaningful explicit
                // operation or new owner. No automatic failed-connect loop.
                LastMonitorFailure = error is NotSupportedException unsupported
                    ? unsupported.Message == "reader-entry-names-unavailable" ? "reader-entry-names-unavailable" : "reader-wait-unavailable" : "reader-monitor-failed";
                diagnostics?.Write("monitor-failed", new { reason = LastMonitorFailure });
            }
        }, CancellationToken.None);
    }

    private async Task RetireMonitorAsync()
    {
        monitorCancellation?.Cancel();
        try { if (monitorTask is not null) await monitorTask; }
        finally {
            monitorTask = null;
            monitorCancellation?.Dispose(); monitorCancellation = null;
        }
    }

    public async Task ShutdownAsync()
    {
        shutdown.Cancel();
        await gate.WaitAsync();
        try { stopped = true; await RetireMonitorAsync(); }
        finally { gate.Release(); }
    }
    public async ValueTask DisposeAsync()
    {
        await ShutdownAsync(); shutdown.Dispose(); gate.Dispose();
    }
}
