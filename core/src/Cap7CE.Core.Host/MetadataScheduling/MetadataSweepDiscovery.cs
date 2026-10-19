using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataExtraction;

namespace Cap7CE.Core.Host.MetadataScheduling;

// Bounded Catalog pages and durable queue counts only. Empty change input never starts polling.
internal sealed class MetadataSweepDiscovery(IMetadataBuildSession session, IReadOnlyList<FileFactChangeSpecification> specifications,
    MetadataSweepProgress progress, int yieldMilliseconds, int waitMilliseconds)
{
    internal static string[] Volumes(FileFactQueuePolicy policy) => policy.VolumeOrder.Where(volume => policy.Includes.Any(scope => scope.VolumeId == volume)
        && !policy.Excludes.Any(scope => scope.VolumeId == volume && scope.RootFileReference is null)).ToArray();
    internal async Task SweepAsync(FileFactQueuePolicy policy, Dictionary<FileFactKind, long> remaining, CancellationToken token)
    {
        foreach (var volume in Volumes(policy)) {
            progress.Set(value => value with { VolumeId = volume }); await AvailableAsync(volume, token);
            foreach (var specification in specifications) {
                FileFactDiscoveryCursor? after = null;
                do {
                    token.ThrowIfCancellationRequested(); progress.Phase("discovering");
                    var page = await session.DiscoverAsync(new(specification.Kind, specification.ExtractorVersion, specification.Extensions, after, VolumeId: volume), token);
                    progress.Set(value => value with { Discovered = value.Discovered + page.Jobs.Count });
                    remaining[specification.Kind] = remaining.GetValueOrDefault(specification.Kind) + page.Jobs.Count;
                    after = page.Next; await Task.Delay(yieldMilliseconds, token);
                } while (after is not null);
            }
        }
    }
    internal async Task<bool> ChangesAsync(FileFactQueuePolicy policy, Dictionary<FileFactKind, long> remaining, CancellationToken token)
    {
        var more = true;
        for (var step = 0; step < 64 && more; step++) {
            token.ThrowIfCancellationRequested(); more = (await session.ConsumeChangesAsync(new(specifications), token)).HasMore;
            if (more) await Task.Delay(yieldMilliseconds, token);
        }
        foreach (var volume in Volumes(policy)) foreach (var specification in specifications) {
            var ledger = await LedgerAsync(specification, volume, token);
            if (ledger.UnavailableVolumeIds?.Contains(volume) == true) break;
            remaining[specification.Kind] = remaining.GetValueOrDefault(specification.Kind) + ledger.PendingJobs + ledger.LeasedJobs;
        }
        progress.Set(value => value with { Discovered = value.Discovered + remaining.Values.Sum() });
        return more;
    }
    internal async Task<bool> IsAvailableAsync(string volume, CancellationToken token)
        => (await LedgerAsync(specifications[0], volume, token)).UnavailableVolumeIds?.Contains(volume) != true;
    internal async Task AvailableAsync(string volume, CancellationToken token)
    {
        while (!await IsAvailableAsync(volume, token)) { progress.Phase("waiting"); await Task.Delay(waitMilliseconds, token); }
    }
    internal async Task<long> PendingAsync(string volume, CancellationToken token)
    {
        long pending = 0;
        foreach (var specification in specifications) {
            var ledger = await LedgerAsync(specification, volume, token);
            if (ledger.UnavailableVolumeIds?.Contains(volume) == true) return 1;
            pending += ledger.PendingJobs + ledger.LeasedJobs;
        }
        return pending;
    }
    private async Task<FileFactQueueLedger> LedgerAsync(FileFactChangeSpecification specification, string volume, CancellationToken token)
    {
        var status = await session.ReadStatusAsync(new(specification.Kind, specification.ExtractorVersion, volume), token);
        return status.State == "active" && status.Ledger is not null ? status.Ledger : throw new InvalidOperationException("metadata-session-inactive");
    }
}
