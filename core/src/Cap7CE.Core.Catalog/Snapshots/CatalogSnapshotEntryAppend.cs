using Cap7CE.Core.Catalog.DirectoryEntries;

namespace Cap7CE.Core.Catalog;

public sealed partial class CatalogV2SnapshotBuild
{
    private double entryStagingMilliseconds;
    private bool CaptureFileEntries { get; init; }
    private long ExpectedVolumeRevision { get; init; }
    public async Task AppendWithEntriesAsync(CatalogFileEntryChanges changes, CancellationToken token = default)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        if (!CaptureFileEntries || completed || nodesCommitted) throw new InvalidOperationException("Entry snapshot is not active.");
        try {
            CatalogFileEntryPublication.Validate(volumeId, changes.Nodes, changes.Entries);
            await AppendAsync(changes.Nodes, token);
            var watch=System.Diagnostics.Stopwatch.StartNew();await CatalogFileEntryStaging.AppendAsync(connection, transaction, volumeId, changes.Nodes, changes.Entries, token);
            await CatalogFileEntryPendingStaging.AppendAsync(connection, transaction, volumeId, changes.Deferred, token);entryStagingMilliseconds+=watch.Elapsed.TotalMilliseconds;
        }
        catch { completed = true; throw; } // a rejected page must never become a publishable partial build
    }
}
