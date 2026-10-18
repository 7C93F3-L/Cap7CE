using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host.CatalogMaintenance;

// Cached state only: waiting and timing out never open SQLite. Sequence also
// records lifecycle changes that do not alter the Catalog's data revision.
public sealed class CatalogChangeSignal
{
    private readonly object gate = new();
    private TaskCompletionSource changed = NewSignal();
    private CatalogChangeNotice current = new(0, 0, "idle", null, false);
    private static TaskCompletionSource NewSignal() => new(TaskCreationOptions.RunContinuationsAsynchronously);
    public CatalogChangeNotice Snapshot { get { lock (gate) return current; } }
    public void PublishCatalog(long revision)
    {
        if (revision < 0) throw new ArgumentOutOfRangeException(nameof(revision));
        lock (gate) {
            if (revision <= current.CatalogRevision) return;
            Publish(current with { CatalogRevision = revision });
        }
    }
    public void SetState(string state, string? reason = null)
    {
        if (state is not ("idle" or "starting" or "watching" or "paused" or "unavailable" or "failed" or "stopped")
            || reason is not (null or "reader-wait-unavailable" or "reader-entry-names-unavailable" or "owned-storage-unavailable" or "reader-monitor-failed"))
            throw new ArgumentException("Invalid maintenance state.");
        lock (gate) {
            if (state == current.State && reason == current.Reason) return;
            Publish(current with { State = state, Reason = reason });
        }
    }
    private void Publish(CatalogChangeNotice notice)
    {
        current = notice with { Sequence = checked(current.Sequence + 1), Changed = true };
        var previous = changed; changed = NewSignal(); previous.TrySetResult();
    }
    public async Task<CatalogChangeNotice> WaitAsync(CatalogAwaitChangesRequest request, CancellationToken token)
    {
        if (request.AfterSequence < 0 || request.WaitMilliseconds is < 1 or > 25_000)
            throw new ArgumentException("Invalid Catalog wait.");
        token.ThrowIfCancellationRequested(); Task waiting;
        lock (gate) {
            if (request.AfterSequence != current.Sequence) return current with { Changed = true };
            waiting = changed.Task;
        }
        try { await waiting.WaitAsync(TimeSpan.FromMilliseconds(request.WaitMilliseconds), token); }
        catch (TimeoutException) { }
        lock (gate) return current with { Changed = request.AfterSequence != current.Sequence };
    }
}
