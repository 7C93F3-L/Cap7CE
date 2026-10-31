using System.Diagnostics;
using System.Text.Json;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host.MetadataScheduling;

// One sweep owns discovery, serial claims and cancellation. It never opens source paths or configuration files.
public sealed class MetadataBuildSweep
{
    private readonly object gate = new();
    private readonly IMetadataBuildSession session;
    private readonly IReadOnlyList<FileFactChangeSpecification> specifications;
    private readonly MetadataSweepProgress progress;
    private readonly MetadataSweepDiscovery discovery;
    private readonly int yieldMilliseconds, waitMilliseconds;
    private Task? running, pausing;
    private CancellationTokenSource? cancellation;
    private string? fingerprint;
    private bool moreChanges;
    public MetadataBuildSweep(IMetadataBuildSession session, IReadOnlyList<FileFactChangeSpecification> specifications,
        Action<MetadataBuildProgress>? changed = null, int yieldMilliseconds = 15, int waitMilliseconds = 1000)
    {
        if (yieldMilliseconds < 0 || waitMilliseconds < 1) throw new ArgumentException("metadata-build-invalid-timing");
        this.session = session; this.specifications = MetadataBuildSpecifications.Copy(specifications);
        this.yieldMilliseconds = yieldMilliseconds; this.waitMilliseconds = waitMilliseconds;
        progress = new(changed); discovery = new(session, this.specifications, progress, yieldMilliseconds, waitMilliseconds);
    }
    public MetadataBuildProgress Snapshot => progress.Snapshot;
    public bool HasPendingChanges { get { lock (gate) return moreChanges; } }
    public MetadataBuildProgress Start(FileFactQueuePolicy policy, bool allowMetadataExtraction, bool changesOnly = false)
    {
        if (!allowMetadataExtraction) throw new InvalidOperationException("metadata-build-confirmation-required");
        FileFactQueue.ValidatePolicy(policy);
        var copy = policy with { VolumeOrder = policy.VolumeOrder.ToArray(), Includes = policy.Includes.ToArray(), Excludes = policy.Excludes.ToArray() };
        var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (gate) {
            if (running is not null || pausing is not null) throw new InvalidOperationException("metadata-build-busy");
            var nextFingerprint = JsonSerializer.Serialize(new { copy, specifications, changesOnly }, CoreProtocolJson.Options);
            var previous = Snapshot; var resumed = previous.Phase == "paused" && fingerprint == nextFingerprint;
            fingerprint = nextFingerprint; moreChanges = false;
            progress.Reset(new("preparing", Discovered: resumed ? previous.Processed : 0, Processed: resumed ? previous.Processed : 0,
                Failed: resumed ? previous.Failed : 0, Unsupported: resumed ? previous.Unsupported : 0));
            var abort = cancellation = new();
            running = Task.Run(async () => {
                try { await ready.Task; await RunAsync(copy, changesOnly, abort.Token); }
                finally { lock (gate) { running = null; cancellation = null; } abort.Dispose(); }
            });
        }
        progress.Notify(); ready.SetResult(); return Snapshot;
    }
    public async Task<MetadataBuildProgress> WaitForIdleAsync()
    {
        Task? work; lock (gate) work = running; if (work is not null) await work; return Snapshot;
    }
    public Task<MetadataBuildProgress> PauseAsync()
    {
        Task work, ownPause; TaskCompletionSource ready;
        lock (gate) {
            if (pausing is not null) return PauseResultAsync(pausing);
            if (running is null || Snapshot.Phase is "idle" or "completed" or "failed" or "paused") return Task.FromResult(Snapshot);
            work = running; cancellation?.Cancel(); ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
            ownPause = pausing = Task.Run(async () => {
                await ready.Task;
                try {
                    var failed = false;
                    try { await session.PauseAsync(CancellationToken.None); } catch (Exception error) when (error is not OutOfMemoryException) { failed = true; }
                    await work;
                    if (!failed) progress.Phase("paused");
                    else progress.Set(value => value with { Phase = "failed", ErrorCode = "metadata-control-failed", RemainingSeconds = null });
                }
                finally { lock (gate) pausing = null; }
            });
        }
        progress.Phase("pausing"); ready.SetResult(); return PauseResultAsync(ownPause);
    }
    private async Task<MetadataBuildProgress> PauseResultAsync(Task work) { await work; return Snapshot; }
    private async Task RunAsync(FileFactQueuePolicy policy, bool changesOnly, CancellationToken token)
    {
        var remaining = new Dictionary<FileFactKind, long>(); var estimate = new MetadataBuildEstimate();var lastYield=Stopwatch.GetTimestamp();
        try {
            token.ThrowIfCancellationRequested(); await session.ConfigureAsync(new(true, policy), token);
            if (changesOnly) {
                progress.Phase("discovering"); var more = await discovery.ChangesAsync(policy, remaining, token); lock (gate) moreChanges = more;
            } else await discovery.SweepAsync(policy, remaining, token);
            progress.Set(value => value with { Total = value.Discovered });
            foreach (var volume in MetadataSweepDiscovery.Volumes(policy)) {
                progress.Set(value => value with { VolumeId = volume });
                while (true) {
                    token.ThrowIfCancellationRequested();
                    if (changesOnly) { if (!await discovery.IsAvailableAsync(volume, token)) break; }
                    else await discovery.AvailableAsync(volume, token);
                    var claim = await session.ClaimAsync(token, new(specifications.Select(item => new FileFactExtractor(item.Kind, item.ExtractorVersion)).ToArray(), volume));
                    if (claim.State != FileFactClaimState.Ready) {
                        if (claim.State == FileFactClaimState.Empty && await discovery.PendingAsync(volume, token) == 0) break;
                        progress.Phase("waiting"); await Task.Delay(waitMilliseconds, token); continue;
                    }
                    progress.Phase("extracting"); var ticket = claim.Ticket!; var began = Stopwatch.GetTimestamp();
                    var result = await session.ExecuteAsync(new(ticket.Lease.LeaseId), token); token.ThrowIfCancellationRequested();
                    if (result.Completion is FileFactBrokerCompletion.Published or FileFactBrokerCompletion.ExtractorSuperseded) {
                        var kind = ticket.Lease.Job.Kind; remaining[kind] = Math.Max(0, remaining.GetValueOrDefault(kind) - 1);
                        estimate.Add(kind, Stopwatch.GetElapsedTime(began).TotalMilliseconds);
                        progress.Set(value => value with { Processed = value.Processed + 1, Failed = value.Failed + (result.State == "failed" ? 1 : 0),
                            Unsupported = value.Unsupported + (result.State == "unsupported" ? 1 : 0), Total = Math.Max(value.Total ?? 0, value.Processed + 1), RemainingSeconds = estimate.Remaining(remaining) });
                    }
                    if(yieldMilliseconds>0&&Stopwatch.GetElapsedTime(lastYield).TotalMilliseconds>=yieldMilliseconds){await Task.Delay(1,token);lastYield=Stopwatch.GetTimestamp();}
                }
            }
            token.ThrowIfCancellationRequested(); progress.Set(value => value with { VolumeId = null, RemainingSeconds = 0, Phase = "completed" });
        }
        catch (Exception error) when (error is not OutOfMemoryException) {
            if (token.IsCancellationRequested) progress.Phase("paused");
            else {
                try { await session.PauseAsync(CancellationToken.None); } catch (Exception pauseError) when (pauseError is not OutOfMemoryException) { }
                progress.Set(value => value with { Phase = "failed", ErrorCode = "metadata-build-failed", RemainingSeconds = null });
            }
        }
    }
}
