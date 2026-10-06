using Cap7CE.Core.Catalog.FileFacts;

namespace Cap7CE.Core.Host.MetadataExtraction;

public sealed record FileFactExtractionTicket(FileFactLease Lease, string FullPath);
public enum FileFactClaimState { Ready, Empty, Busy, SourceDeferred }
public sealed record FileFactClaimResult(FileFactClaimState State, FileFactExtractionTicket? Ticket = null, long? RetryAfterUnixMilliseconds = null);
public sealed record FileFactExtractionResult(FileFactState State, int? Width = null, int? Height = null,
    long? DurationMilliseconds = null, string? ErrorCode = null, bool? IsAnimated = null,
    IReadOnlyDictionary<string, int>? VisualProperties = null, int? ChannelCount = null,
    FileFactFontProperties? FontProperties = null,
    FileFactModelProperties? ModelProperties = null,
    FileFactDocumentProperties? DocumentProperties = null,
    FileFactThreeDProperties? ThreeDProperties = null,
    FileFactTextDataProperties? TextDataProperties = null,
    FileFactArchiveProperties? ArchiveProperties = null);
public enum FileFactBrokerCompletion { Published, LeaseLost, SourceDeferred, SourceChanged, ExtractorSuperseded }

// Explicitly activated broker for an ordinary-account extraction client. No worker processes or source content access.
public sealed class FileFactExtractionBroker
{
    private readonly FileFactQueue queue;
    private readonly FileFactSourceResolver resolver;
    private readonly Dictionary<string, OwnedTicket> owned = new(StringComparer.Ordinal);
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly TimeProvider clock;
    private readonly int maximumInFlight;
    private string? policyJson;

    public FileFactExtractionBroker(string databasePath, int maximumInFlight = 1, TimeProvider? timeProvider = null)
    {
        if (maximumInFlight is < 1 or > 2) throw new ArgumentOutOfRangeException(nameof(maximumInFlight));
        clock = timeProvider ?? TimeProvider.System;
        queue = new(databasePath, clock);
        resolver = new(databasePath);
        this.maximumInFlight = maximumInFlight;
    }

    public Task InitializeAsync(CancellationToken token = default) => queue.InitializeAsync(token);
    public async Task SetPolicyAsync(FileFactQueuePolicy policy, CancellationToken token = default)
    {
        await gate.WaitAsync(token);
        try
        {
            await queue.SetPolicyAsync(policy, token);
            var next = System.Text.Json.JsonSerializer.Serialize(policy);
            if (next != policyJson) owned.Clear();
            policyJson = next;
        }
        finally { gate.Release(); }
    }
    public Task EnqueueAsync(IReadOnlyList<FileFactJob> jobs, CancellationToken token = default) => queue.EnqueueAsync(jobs, token);

    public async Task<FileFactClaimResult> ClaimAsync(CancellationToken token = default, FileFactClaimSpecification? specification = null)
    {
        FileFactSelection.Validate(specification);
        await gate.WaitAsync(token);
        try
        {
            PruneExpired();
            if (owned.Count >= maximumInFlight) return new(FileFactClaimState.Busy);
            var lease = await queue.ClaimAsync(token: token, specification: specification);
            // Empty means no immediately claimable job, not proof that every persisted job is done.
            if (lease is null) return new(FileFactClaimState.Empty);
            var source = await resolver.ResolveAsync(lease.Job.Identity, token);
            token.ThrowIfCancellationRequested();
            if (source is null || source.Source != lease.Source || !NativeFileFactSourceGuard.Matches(source))
                return new(FileFactClaimState.SourceDeferred, RetryAfterUnixMilliseconds: lease.ExpiresUnixMilliseconds);
            var ticket = new FileFactExtractionTicket(lease, source.FullPath);
            owned.Add(lease.LeaseId, new(ticket, source));
            return new(FileFactClaimState.Ready, ticket);
        }
        finally { gate.Release(); }
    }

    public async Task<bool> RenewAsync(string leaseId, CancellationToken token = default)
    {
        await gate.WaitAsync(token);
        try
        {
            PruneExpired();
            if (!owned.TryGetValue(leaseId, out var current)) return false;
            if (!await queue.RenewAsync(leaseId, token: token)) { owned.Remove(leaseId); return false; }
            owned[leaseId] = current with { Ticket = current.Ticket with { Lease = current.Ticket.Lease with {
                ExpiresUnixMilliseconds = checked(clock.GetUtcNow().ToUnixTimeMilliseconds() + 30_000) } } };
            return true;
        }
        finally { gate.Release(); }
    }

    public async Task<FileFactBrokerCompletion> CompleteAsync(string leaseId, FileFactExtractionResult result,
        CancellationToken token = default)
    {
        ArgumentNullException.ThrowIfNull(result);
        await gate.WaitAsync(token);
        try
        {
            PruneExpired();
            if (!owned.TryGetValue(leaseId, out var current)) return FileFactBrokerCompletion.LeaseLost;
            token.ThrowIfCancellationRequested();
            // Do not cache path/identity failures as permanent extractor failures: rename may preserve content version.
            if (!NativeFileFactSourceGuard.Matches(current.Source))
            {
                owned.Remove(leaseId);
                return FileFactBrokerCompletion.SourceDeferred;
            }
            var lease = current.Ticket.Lease;
            var observation = new FileFactObservation(lease.Job.Identity, lease.Source, lease.Job.Kind,
                lease.Job.ExtractorVersion, result.State, result.Width, result.Height, result.DurationMilliseconds, result.ErrorCode,
                result.IsAnimated, result.VisualProperties, result.ChannelCount, result.FontProperties, result.ModelProperties, result.DocumentProperties, result.ThreeDProperties, result.TextDataProperties, result.ArchiveProperties);
            var completed = await queue.CompleteAsync(leaseId, observation, token);
            owned.Remove(leaseId);
            return completed switch
            {
                FileFactCompletion.Published => FileFactBrokerCompletion.Published,
                FileFactCompletion.SourceChanged => FileFactBrokerCompletion.SourceChanged,
                FileFactCompletion.ExtractorSuperseded => FileFactBrokerCompletion.ExtractorSuperseded,
                _ => FileFactBrokerCompletion.LeaseLost
            };
        }
        finally { gate.Release(); }
    }

    private void PruneExpired()
    {
        var now = clock.GetUtcNow().ToUnixTimeMilliseconds();
        foreach (var key in owned.Where(pair => pair.Value.Ticket.Lease.ExpiresUnixMilliseconds <= now).Select(pair => pair.Key).ToArray())
            owned.Remove(key);
    }

    private sealed record OwnedTicket(FileFactExtractionTicket Ticket, FileFactResolvedSource Source);
}
