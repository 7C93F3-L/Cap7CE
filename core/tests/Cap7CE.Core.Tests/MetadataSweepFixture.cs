using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Host.MetadataScheduling;

namespace Cap7CE.Core.Tests;

internal sealed class MetadataSweepFixture : IMetadataBuildSession
{
    internal static readonly string[] Volumes = [new('a', 32), new('b', 32)];
    internal static readonly FileFactQueuePolicy Policy = new(Volumes, Volumes.Select(volume => new FileFactScope(volume)).ToArray(), []);
    internal static readonly FileFactChangeSpecification[] Specifications = [new(FileFactKind.ImageDimensions, 1, [".png"]), new(FileFactKind.Video, 2, [".mp4"])];
    private sealed class Row(FileFactJob job) { internal FileFactJob Job = job; internal bool Queued, Done; internal string? Lease; }
    private readonly object gate = new();
    private readonly List<Row> rows;
    private readonly List<string> order = [];
    private int sequence, configurations, reads, statusReads, discoveries, pauses, changes, live;
    private bool active;
    internal volatile bool Offline, BlockRead, BlockConfiguration, EmptyOnce, SourceChangedOnce, Fault;
    internal volatile int BlockAfter = int.MaxValue;
    internal volatile bool PauseFault;
    internal int ExitDelay;
    internal string ResultState = "indexed";
    internal int MoreChanges;
    internal TaskCompletionSource? ExecutionGate;
    internal int Configurations => Volatile.Read(ref configurations);
    internal int Reads => Volatile.Read(ref reads);
    internal int StatusReads => Volatile.Read(ref statusReads);
    internal int Discoveries => Volatile.Read(ref discoveries);
    internal int Pauses => Volatile.Read(ref pauses);
    internal int Changes => Volatile.Read(ref changes);
    internal int Live => Volatile.Read(ref live);
    internal string[] Order { get { lock (gate) return order.ToArray(); } }
    internal int Finished { get { lock (gate) return rows.Count(row => row.Done); } }
    internal MetadataSweepFixture(int perKind = 4) => rows = Volumes.SelectMany(volume => Specifications.SelectMany(specification =>
        Enumerable.Range(1, perKind).Select(index => new Row(new(new(volume, (index + (int)specification.Kind * 100).ToString("x16")), specification.Kind, specification.ExtractorVersion))))).ToList();
    public async Task<FileFactHostStatus> ConfigureAsync(FileFactConfigurationRequest request, CancellationToken token)
    {
        Interlocked.Increment(ref configurations); TestAssert.True(request.AllowMetadataExtraction, "runner never fabricates an unconfirmed configure");
        if (BlockConfiguration) await Task.Delay(10000, token);
        token.ThrowIfCancellationRequested(); lock (gate) active = true; return new("active");
    }
    public Task<FileFactHostStatus> PauseAsync(CancellationToken token)
    {
        if (PauseFault) throw new IOException("synthetic pause failure");
        Interlocked.Increment(ref pauses); lock (gate) { active = false; foreach (var row in rows) row.Lease = null; }
        return Task.FromResult(new FileFactHostStatus("paused"));
    }
    public Task<FileFactDiscoveryPage> DiscoverAsync(FileFactDiscoveryRequest request, CancellationToken token)
    {
        token.ThrowIfCancellationRequested(); Interlocked.Increment(ref discoveries);
        lock (gate) {
            var offset = request.After is null ? 0 : Convert.ToInt32(request.After.FileReference, 16);
            var eligible = rows.Where(row => row.Job.Identity.VolumeId == request.VolumeId && row.Job.Kind == request.Kind && !row.Done).ToArray();
            var page = eligible.Skip(offset).Take(2).ToArray(); foreach (var row in page) row.Queued = true;
            return Task.FromResult(new FileFactDiscoveryPage(page.Select(row => row.Job).ToArray(), offset + 2 < eligible.Length ? new(request.VolumeId!, (offset + 2).ToString("x16"), new('a', 64)) : null));
        }
    }
    public Task<FileFactChangeDispatchStep> ConsumeChangesAsync(FileFactConsumeChangesRequest request, CancellationToken token)
    {
        token.ThrowIfCancellationRequested(); Interlocked.Increment(ref changes);
        lock (gate) { foreach (var row in rows.Where(row => !row.Done)) row.Queued = true; return Task.FromResult(new FileFactChangeDispatchStep(0, true, MoreChanges-- > 0)); }
    }
    public Task<FileFactHostStatus> ReadStatusAsync(FileFactQueueStatusRequest request, CancellationToken token)
    {
        token.ThrowIfCancellationRequested(); Interlocked.Increment(ref statusReads);
        lock (gate) {
            var eligible = rows.Where(row => row.Queued && !row.Done && row.Job.Kind == request.Kind && row.Job.Identity.VolumeId == request.VolumeId).ToArray();
            return Task.FromResult(new FileFactHostStatus(active ? "active" : "paused", new(1, eligible.Count(row => row.Lease is null), eligible.Count(row => row.Lease is not null), 0, null, Offline ? [request.VolumeId!] : [])));
        }
    }
    public Task<FileFactClaimResult> ClaimAsync(CancellationToken token, FileFactClaimSpecification? specification = null)
    {
        token.ThrowIfCancellationRequested(); lock (gate) {
            if (EmptyOnce) { EmptyOnce = false; return Task.FromResult(new FileFactClaimResult(FileFactClaimState.Empty)); }
            var row = rows.FirstOrDefault(row => row.Queued && !row.Done && row.Lease is null && row.Job.Identity.VolumeId == specification!.VolumeId);
            if (row is null) return Task.FromResult(new FileFactClaimResult(FileFactClaimState.Empty));
            row.Lease = (++sequence).ToString("x32"); order.Add(row.Job.Identity.VolumeId);
            return Task.FromResult(new FileFactClaimResult(FileFactClaimState.Ready, new(new(row.Lease, row.Job, new(1, 1, 1, 1), long.MaxValue), "Z:\\synthetic")));
        }
    }
    public async Task<FileFactExecutionResult> ExecuteAsync(FileFactLeaseRequest request, CancellationToken token)
    {
        token.ThrowIfCancellationRequested(); var read = Interlocked.Increment(ref reads); Interlocked.Increment(ref live);
        try {
            if (ExecutionGate is not null) await ExecutionGate.Task.WaitAsync(token);
            await Task.Delay(BlockRead || read >= BlockAfter ? 10000 : 2, token); if (Fault) throw new IOException("synthetic parser failure");
            lock (gate) {
                var row = rows.SingleOrDefault(row => row.Lease == request.LeaseId); if (row is null || !active) return new(FileFactBrokerCompletion.LeaseLost, null);
                row.Lease = null; if (SourceChangedOnce) { SourceChangedOnce = false; return new(FileFactBrokerCompletion.SourceChanged, null); }
                row.Done = true; return new(FileFactBrokerCompletion.Published, ResultState);
            }
        }
        finally { if (ExitDelay > 0) await Task.Delay(ExitDelay); Interlocked.Decrement(ref live); }
    }
}
