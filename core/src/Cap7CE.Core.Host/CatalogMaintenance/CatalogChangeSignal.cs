using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host.CatalogMaintenance;

// Cached state only: waiting and timing out never open SQLite. Sequence also
// records lifecycle changes that do not alter the Catalog's data revision.
public sealed class CatalogChangeSignal
{
    private readonly object gate = new();
    private TaskCompletionSource changed = NewSignal();
    private readonly Queue<CatalogChangeNotice> history=new();
    private CatalogChangeNotice current = new(0, 0, "idle", null, false);
    private static TaskCompletionSource NewSignal() => new(TaskCreationOptions.RunContinuationsAsynchronously);
    public CatalogChangeNotice Snapshot { get { lock (gate) return current; } }
    public void PublishCatalog(long revision)
    {
        if (revision < 0) throw new ArgumentOutOfRangeException(nameof(revision));
        lock (gate) {
            if (revision <= current.CatalogRevision) return;
            Publish(current with { CatalogRevision = revision,Scopes=null });
        }
    }
    public void PublishScoped(long revision,CatalogChangeScope scope)
    {
        lock(gate) {
            if(revision<=current.CatalogRevision)return;
            var paths=scope.RelativePaths?.Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            if(paths is {Length:>256}||paths?.Sum(p=>p.Length)>32768)paths=null;
            Publish(current with{CatalogRevision=revision,Scopes=revision==current.CatalogRevision+1?[new(scope.VolumeId,paths)]:null});
        }
    }
    public void SetState(string state, string? reason = null)
    {
        if (state is not ("idle" or "starting" or "watching" or "paused" or "unavailable" or "failed" or "stopped")
            || reason is not (null or "reader-wait-unavailable" or "reader-entry-names-unavailable" or "owned-storage-unavailable" or "reader-monitor-failed"))
            throw new ArgumentException("Invalid maintenance state.");
        lock (gate) {
            if (state == current.State && reason == current.Reason) return;
            Publish(current with { State = state, Reason = reason,Scopes=[] });
        }
    }
    private void Publish(CatalogChangeNotice notice)
    {
        current = notice with { Sequence = checked(current.Sequence + 1), Changed = true };
        history.Enqueue(current);while(history.Count>32)history.Dequeue();
        var previous = changed; changed = NewSignal(); previous.TrySetResult();
    }
    public async Task<CatalogChangeNotice> WaitAsync(CatalogAwaitChangesRequest request, CancellationToken token,bool includeScopes=false)
    {
        if (request.AfterSequence < 0 || request.WaitMilliseconds is < 1 or > 25_000)
            throw new ArgumentException("Invalid Catalog wait.");
        token.ThrowIfCancellationRequested(); Task waiting;
        lock (gate) {
            if (request.AfterSequence != current.Sequence) return includeScopes?Since(request.AfterSequence):current with{Changed=true,Scopes=null};
            waiting = changed.Task;
        }
        try { await waiting.WaitAsync(TimeSpan.FromMilliseconds(request.WaitMilliseconds), token); }
        catch (TimeoutException) { }
        lock (gate) return includeScopes?Since(request.AfterSequence):current with{Changed=request.AfterSequence!=current.Sequence,Scopes=null};
    }
    private CatalogChangeNotice Since(long sequence)
    {
        if(sequence==current.Sequence)return current with{Changed=false,Scopes=[]};
        if(sequence>current.Sequence||history.Count==0||sequence<history.Peek().Sequence-1)return current with{Changed=true,Scopes=null};
        var notices=history.Where(n=>n.Sequence>sequence).ToArray();
        if(notices.Any(n=>n.Scopes is null))return current with{Scopes=null};
        var scopes=notices.SelectMany(n=>n.Scopes!).GroupBy(s=>s.VolumeId,StringComparer.Ordinal).Select(group=>{
            var paths=group.Any(s=>s.RelativePaths is null)?null:group.SelectMany(s=>s.RelativePaths!).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            if(paths is {Length:>256}||paths?.Sum(p=>p.Length)>32768)paths=null;
            return new CatalogChangeScope(group.Key,paths);
        }).ToArray();
        if(scopes.Sum(s=>s.RelativePaths?.Sum(p=>p.Length)??0)>32768)scopes=scopes.Select(s=>new CatalogChangeScope(s.VolumeId,null)).ToArray();
        return current with{Changed=true,Scopes=scopes.Length<=32?scopes:null};
    }
}
