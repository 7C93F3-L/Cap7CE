namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactChangeSpecification(FileFactKind Kind, int ExtractorVersion, IReadOnlyList<string> Extensions);
public sealed record FileFactChangeDispatchStep(int JobsDiscovered, bool Acknowledged, bool HasMore);

// A bounded, explicitly driven queue producer. Construction does not initialize
// stores or authorize extraction. Its owner serializes steps with grant changes.
// Only a fully enqueued hint is acknowledged; process loss safely replays it.
public sealed class FileFactChangeDispatcher
{
    private readonly CatalogV2Database catalog;
    private readonly FileFactChangeLog changes;
    private readonly FileFactDiscovery discovery;
    private readonly FileFactQueue queue;
    private readonly FileFactQueuePolicy policy;
    private readonly FileFactChangeSpecification[] specifications;
    private FileFactCatalogChange? pending;
    private FileFactDiscoveryCursor? cursor;
    private int specificationIndex;
    private long scanAfter;
    private long pendingRevision;

    public FileFactChangeDispatcher(string databasePath, FileFactQueuePolicy policy,
        IReadOnlyList<FileFactChangeSpecification> specifications)
    {
        FileFactQueue.ValidatePolicy(policy);
        ArgumentNullException.ThrowIfNull(specifications);
        if (specifications.Count is < 1 or > 16 || specifications.Any(item => item is null
            || !Enum.IsDefined(item.Kind) || item.ExtractorVersion <= 0 || item.Extensions is null
            || item.Extensions.Count is < 1 or > 64 || item.Extensions.Any(extension => extension is null
                || extension.Length is < 2 or > 16 || extension[0] != '.'
                || extension[1..].Any(character => !char.IsAsciiLetterOrDigit(character))))
            || specifications.Select(item => item.Kind).Distinct().Count() != specifications.Count)
            throw new ArgumentException("Invalid change dispatch specifications.");
        this.policy = policy with { VolumeOrder = policy.VolumeOrder.ToArray(),
            Includes = policy.Includes.ToArray(), Excludes = policy.Excludes.ToArray() };
        this.specifications = specifications.Select(item => item with { Extensions = item.Extensions.ToArray() }).ToArray();
        catalog = new(databasePath); changes = new(databasePath);
        discovery = new(databasePath); queue = new(databasePath);
    }

    public async Task<FileFactChangeDispatchStep> StepAsync(int pageSize = 128, CancellationToken token = default)
    {
        if (pageSize is < 1 or > 512) throw new ArgumentOutOfRangeException(nameof(pageSize));
        token.ThrowIfCancellationRequested();
        // An empty grant is dormant and must not open or create the facts store.
        if (policy.Includes.Count == 0) return new(0, false, false);
        var ready = (await catalog.ReadVolumesAsync(token)).Where(volume => volume.Selected
            && volume.State == CatalogV2VolumeState.Ready).ToDictionary(volume => volume.VolumeId, StringComparer.Ordinal);
        if (pending is not null && ready.TryGetValue(pending.Identity.VolumeId, out var current)
            && pendingRevision != current.CatalogRevision) {
            cursor = null; specificationIndex = 0; pendingRevision = current.CatalogRevision;
        }
        if (pending is not null && !ready.ContainsKey(pending.Identity.VolumeId)) {
            // Keep the durable hint and let ready drives pass a temporarily offline one.
            scanAfter = pending.Sequence; pending = null; cursor = null; specificationIndex = 0;
        }
        if (pending is null) {
            var page = await changes.ReadAfterAsync(scanAfter, pageSize, token);
            var irrelevant = new List<FileFactCatalogChange>();
            foreach (var change in page) {
                scanAfter = change.Sequence;
                if (!policy.VolumeOrder.Contains(change.Identity.VolumeId, StringComparer.Ordinal)) {
                    irrelevant.Add(change);
                    continue;
                }
                if (!ready.ContainsKey(change.Identity.VolumeId)) continue;
                pending = change; pendingRevision = ready[change.Identity.VolumeId].CatalogRevision; break;
            }
            if (irrelevant.Count > 0) await changes.AcknowledgeAsync(irrelevant, token);
            if (pending is null) {
                var more = page.Count == pageSize;
                if (!more) scanAfter = 0;
                return new(0, irrelevant.Count > 0, more);
            }
        }
        var specification = specifications[specificationIndex];
        var discovered = await discovery.ReadChangedPageAsync(policy, specification.Kind, specification.ExtractorVersion,
            specification.Extensions, pending, cursor, pageSize, token);
        await queue.EnqueueAsync(discovered.Jobs, token);
        if (discovered.Next is not null) cursor = discovered.Next;
        else if (specificationIndex + 1 < specifications.Length) { specificationIndex++; cursor = null; }
        else {
            var acknowledged = await changes.AcknowledgeIfUnchangedAsync(pending, pendingRevision, token);
            if (!acknowledged) scanAfter = 0;
            pending = null; cursor = null; specificationIndex = 0;
            return new(discovered.Jobs.Count, acknowledged, true);
        }
        return new(discovered.Jobs.Count, false, true);
    }
}
