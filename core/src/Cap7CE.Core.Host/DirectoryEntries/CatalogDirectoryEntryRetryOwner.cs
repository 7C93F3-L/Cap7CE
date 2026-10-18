using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;

namespace Cap7CE.Core.Host;

// Serial Reader-owner work. Cached deadlines keep empty/blocked queues silent.
public sealed class CatalogDirectoryEntryRetryOwner
{
    private readonly CatalogV2Database catalog;
    private readonly CatalogReaderVolume volume;
    private readonly CatalogFileEntryPending pending;
    private readonly CatalogDirectoryEntryCapture capture;
    private readonly TimeProvider clock;
    public long NextDue { get; private set; }
    public CatalogDirectoryEntryRetryOwner(CatalogV2Database catalog, ICatalogReaderSession reader, CatalogReaderVolume volume, TimeProvider? clock = null)
    {
        this.catalog = catalog; this.volume = volume; this.clock = clock ?? TimeProvider.System;
        pending = new(catalog); capture = new(reader, volume, true);
    }
    public void NotifyJournalChange() => NextDue = 0;
    public async Task<long?> StepAsync(CancellationToken token = default)
    {
        var now = clock.GetUtcNow().ToUnixTimeMilliseconds();
        if (now < NextDue) return null;
        var revision = await catalog.ReadRevisionAsync(token);
        var current = await catalog.ReadVolumeAsync(volume.CatalogId, token) ?? throw new CatalogConcurrencyException("Retry volume disappeared.");
        if (!current.Selected || current.State != CatalogV2VolumeState.Ready) { NextDue = long.MaxValue; return null; }
        var page = await pending.ReadDueAsync(volume.CatalogId, now, token: token); NextDue = page.NextRetryAt;
        if (page.Items.Count == 0) return null;
        var changes = await capture.CaptureDeferredAsync(page.Items, token);
        CatalogV2WriteBatch Batch(CatalogFileEntryChanges value) => new(volume.CatalogId, current.JournalId, current.CheckpointUsn,
            revision, current.CheckpointUsn!.Value, current.JournalFirstUsn, current.JournalLowestValidUsn,
            value.Nodes, value.Entries, value.Deferred, now);
        var committed = await CatalogDirectoryEntryRetryPublication.ApplyAsync(catalog, Batch(changes), page.Items, token);
        if (committed is null) { NextDue = checked(now + 1000); return null; }
        var next = await pending.ReadDueAsync(volume.CatalogId, now, 1, token); NextDue = next.NextRetryAt;
        return committed.CatalogRevision;
    }
}
