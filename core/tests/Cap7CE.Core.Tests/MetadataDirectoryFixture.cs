using System.Text.Json;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataBuild;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Host.MetadataScheduling;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Tests;

internal sealed class MetadataDirectoryFixture : IMetadataBuildSession, IMetadataBuildCatalog
{
    internal static readonly string Volume = new('a', 32), Assets = new('1', 16), Other = new('2', 16);
    internal static readonly FileFactQueuePolicy GlobalPolicy = new([Volume], [new(Volume)], []);
    internal static readonly FileFactChangeSpecification[] Specifications = [new(FileFactKind.ImageDimensions, 1, [".png"])];
    private sealed class Row(string name, string reference, string[] parents) { internal string Name = name, Reference = reference; internal string[] Parents = parents; internal bool Queued, Done; internal string? Lease; }
    private readonly object gate = new();
    private readonly Row[] rows = [new("inside", new('3', 16), [Assets]), new("nested", new('4', 16), [Assets, new('5', 16)]), new("outside", new('6', 16), [Other])];
    private readonly List<string> finished = [];
    private FileFactQueuePolicy policy = GlobalPolicy;
    private int sequence, reads, live, maximumLive, configurations;
    private bool active;
    internal string DisplayName = "X:";
    internal volatile bool Building, Changed, BlockAll, BlockGlobal, FailDirectoryWrites;
    internal JsonElement? SavedGlobal, SavedDirectory;
    internal TaskCompletionSource? BlockDirectoryWrite;
    internal TaskCompletionSource DirectoryWriteEntered = new(TaskCreationOptions.RunContinuationsAsynchronously);
    internal Func<CancellationToken, Task>? ResolveGate;
    internal int Reads => Volatile.Read(ref reads);
    internal int Configurations => Volatile.Read(ref configurations);
    internal int MaximumLive => Volatile.Read(ref maximumLive);
    internal string[] Finished { get { lock (gate) return finished.ToArray(); } }
    internal MetadataBuildCoordinator Create()
    {
        var lifecycle = new MetadataBuildGrantLifecycle(() => Task.FromResult(SavedGlobal?.Clone()), value => { SavedGlobal = value.Clone(); return Task.CompletedTask; });
        var global = new MetadataGlobalBuildOwner(this, this, lifecycle, Specifications, yieldMilliseconds: 0, waitMilliseconds: 2);
        return new(global, this, this, () => Task.FromResult(SavedDirectory?.Clone()), async value => {
            TestAssert.True(MetadataBuildStateSchema.DirectoryQueue(value), "valid legacy directory schema"); DirectoryWriteEntered.TrySetResult();
            if (BlockDirectoryWrite is not null) await BlockDirectoryWrite.Task;
            if (FailDirectoryWrites) throw new IOException("synthetic private disk detail", unchecked((int)0x80070070));
            SavedDirectory = value.Clone();
        }, Specifications, yieldMilliseconds: 0, waitMilliseconds: 2);
    }
    internal void SaveGlobal(string intent) => SavedGlobal = CoreProtocolJson.ToElement(new { version = 2, intent, consent = intent != "configured", policy = GlobalPolicy, scopeLabels = new Dictionary<string, string>() });
    public Task<CatalogStatusResponse> ReadStatusAsync(CancellationToken token)
    {
        token.ThrowIfCancellationRequested(); return Task.FromResult(new CatalogStatusResponse([new(Volume, DisplayName, "NTFS", true, Building ? "building" : "ready", 0, null, !Building, false)], [], 1));
    }
    public async Task<CatalogResolveScopeResponse> ResolveScopeAsync(CatalogResolveScopeRequest request, CancellationToken token)
    {
        if (ResolveGate is not null) await ResolveGate(token);
        var root = request.Path.Length == 3 ? null : Changed ? new('7', 16) : request.Path.EndsWith("Other", StringComparison.OrdinalIgnoreCase) ? Other : Assets;
        return new(!Building, Volume, root, "X:", Building ? "building" : "ready", !Building);
    }
    private bool Matches(Row row) => policy.Includes.Any(scope => scope.RootFileReference is null || row.Parents.Contains(scope.RootFileReference))
        && !policy.Excludes.Any(scope => scope.RootFileReference is null || row.Parents.Contains(scope.RootFileReference));
    public Task<FileFactHostStatus> ConfigureAsync(FileFactConfigurationRequest request, CancellationToken token)
    {
        token.ThrowIfCancellationRequested(); Interlocked.Increment(ref configurations); lock (gate) { policy = request.Policy; active = true; } return Task.FromResult(new FileFactHostStatus("active"));
    }
    public Task<FileFactHostStatus> PauseAsync(CancellationToken token)
    {
        lock (gate) { active = false; foreach (var row in rows) row.Lease = null; } return Task.FromResult(new FileFactHostStatus("paused"));
    }
    public Task<FileFactDiscoveryPage> DiscoverAsync(FileFactDiscoveryRequest request, CancellationToken token)
    {
        token.ThrowIfCancellationRequested(); lock (gate) {
            var selected = rows.Where(row => Matches(row) && !row.Done).ToArray(); foreach (var row in selected) row.Queued = true;
            return Task.FromResult(new FileFactDiscoveryPage(selected.Select(row => new FileFactJob(new(Volume, row.Reference), FileFactKind.ImageDimensions, 1)).ToArray(), null));
        }
    }
    public Task<FileFactChangeDispatchStep> ConsumeChangesAsync(FileFactConsumeChangesRequest request, CancellationToken token)
    {
        token.ThrowIfCancellationRequested(); lock (gate) { foreach (var row in rows.Where(row => Matches(row) && !row.Done)) row.Queued = true; } return Task.FromResult(new FileFactChangeDispatchStep(0, true, false));
    }
    public Task<bool> IsVolumeAvailableAsync(string volume, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        lock (gate) { if (!active) throw new InvalidOperationException("metadata-session-inactive"); return Task.FromResult(!Building); }
    }
    public Task<FileFactHostStatus> ReadStatusAsync(FileFactQueueStatusRequest request, CancellationToken token)
    {
        token.ThrowIfCancellationRequested(); lock (gate) { var selected = rows.Where(row => Matches(row) && row.Queued && !row.Done).ToArray();
            return Task.FromResult(new FileFactHostStatus(active ? "active" : "paused", new(1, selected.Count(row => row.Lease is null), selected.Count(row => row.Lease is not null), 0, null, []))); }
    }
    public Task<FileFactClaimResult> ClaimAsync(CancellationToken token, FileFactClaimSpecification? specification = null)
    {
        token.ThrowIfCancellationRequested(); lock (gate) {
            var row = rows.FirstOrDefault(row => Matches(row) && row.Queued && !row.Done && row.Lease is null);
            if (row is null) return Task.FromResult(new FileFactClaimResult(FileFactClaimState.Empty));
            row.Lease = (++sequence).ToString("x32"); return Task.FromResult(new FileFactClaimResult(FileFactClaimState.Ready,
                new(new(row.Lease, new(new(Volume, row.Reference), FileFactKind.ImageDimensions, 1), new(1, 1, 1, 1), long.MaxValue), "X:\\synthetic")));
        }
    }
    public async Task<FileFactExecutionResult> ExecuteAsync(FileFactLeaseRequest request, CancellationToken token)
    {
        Interlocked.Increment(ref reads); bool global;
        lock (gate) { global = policy.Includes[0].RootFileReference is null; live++; maximumLive = Math.Max(maximumLive, live); }
        try {
            while (BlockAll || BlockGlobal && global) await Task.Delay(2, token);
            await Task.Delay(2, token);
            lock (gate) {
                var row = rows.SingleOrDefault(row => row.Lease == request.LeaseId); if (row is null || !active) return new(FileFactBrokerCompletion.LeaseLost, null);
                row.Done = true; row.Lease = null; finished.Add(row.Name); return new(FileFactBrokerCompletion.Published, "indexed");
            }
        }
        finally { lock (gate) live--; }
    }
}
