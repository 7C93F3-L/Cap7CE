namespace Cap7CE.Core.Host.MetadataScheduling;

// Coalesced real-event wakes. Revision/epoch fences prevent a retired wake from acquiring a newer grant.
internal sealed class MetadataBuildChangeDrain(MetadataBuildSweep sweep, Func<long, bool> begin, Action<long> failure)
{
    private readonly object gate = new();
    private Task? running;
    private bool pending;
    private long epoch, requestedRevision;
    internal void Notify(long revision)
    {
        lock (gate) {
            pending = true; requestedRevision = Math.Max(requestedRevision, revision);
            if (running is not null) return;
            var ownEpoch = epoch;
            running = Task.Run(async () => {
                var ownRevision = revision;
                try {
                    while (true) {
                        lock (gate) { if (!pending || epoch != ownEpoch) return; pending = false; ownRevision = requestedRevision; }
                        await sweep.WaitForIdleAsync();
                        lock (gate) if (epoch != ownEpoch) return;
                        if (!begin(ownRevision)) return;
                        var completed = await sweep.WaitForIdleAsync();
                        lock (gate) {
                            if (epoch != ownEpoch || completed.Phase != "completed") return;
                            if (sweep.HasPendingChanges) pending = true;
                        }
                    }
                }
                catch (Exception error) when (error is not OutOfMemoryException) {
                    bool current; lock (gate) { current = epoch == ownEpoch; if (current) pending = false; }
                    if (current) failure(ownRevision);
                }
                finally {
                    bool restart; long next; lock (gate) { running = null; restart = pending; next = requestedRevision; }
                    if (restart) Notify(next);
                }
            });
        }
    }
    internal void Reset() { lock (gate) { epoch++; pending = false; requestedRevision = 0; } }
    internal async Task WaitForIdleAsync()
    {
        while (true) { Task? work; lock (gate) work = running; if (work is null) return; await work; }
    }
}
