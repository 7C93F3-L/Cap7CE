using Cap7CE.Core.Catalog;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Host.CatalogMaintenance;

// Runs only as the CatalogReaderOwnership monitor delegate. Native waits wake
// bounded round-robin page work; quiet timeouts perform no Catalog queries.
public sealed class CatalogJournalMonitor
{
    private const int MaximumPagesPerTurn = 16;
    private readonly CatalogV2Database catalog;
    private readonly ICatalogReaderSessionFactory factory;
    private readonly CatalogSynchronizationService synchronization;
    private readonly Func<IReadOnlyList<CatalogV2VolumeSnapshot>, CancellationToken, Task<IReadOnlyList<FileFactOwnedStorageRoot>>> resolveRoots;
    private readonly Action<long> published;
    private readonly TimeProvider time;
    private readonly Action listening;
    private readonly bool captureFileEntries;
    public CatalogJournalMonitor(CatalogV2Database catalog, ICatalogReaderSessionFactory factory,
        Func<IReadOnlyList<CatalogV2VolumeSnapshot>, CancellationToken, Task<IReadOnlyList<FileFactOwnedStorageRoot>>> resolveRoots,
        Action<long> published, TimeProvider? time = null, Action? listening = null, CatalogPreparationDiagnostics? diagnostics = null, bool captureFileEntries = false)
    {
        this.catalog = catalog; this.factory = factory; synchronization = new(catalog, factory, diagnostics, captureFileEntries);
        this.captureFileEntries = captureFileEntries;
        this.resolveRoots = resolveRoots; this.published = published; this.time = time ?? TimeProvider.System;
        this.listening = listening ?? (() => { });
    }

    public async Task RunAsync(CancellationToken token)
    {
        await new Cap7CE.Core.Catalog.DirectoryEntries.CatalogFileEntryActivation(catalog).RequireWriterAsync(captureFileEntries, token);
        while (true) {
            token.ThrowIfCancellationRequested();
            var ready = await ReadReadyAsync(token);
            if (ready.Count == 0) return; // restarted by explicit selection/build; no idle discovery loop
            await using var reader = await factory.ConnectAsync(token);
            if (!reader.SupportsJournalChangeWait) throw new NotSupportedException("reader-journal-wait-unavailable");
            if (captureFileEntries && !reader.SupportsFileEntryNames) throw new NotSupportedException("reader-entry-names-unavailable");
            var started = time.GetTimestamp();
            var native = (await reader.ListVolumesAsync(token)).Where(volume => volume.JournalAvailable)
                .ToDictionary(volume => volume.CatalogId, StringComparer.Ordinal);
            foreach (var volume in ready) {
                if (!native.TryGetValue(volume.VolumeId, out var available)) {
                    await catalog.MarkOfflineAsync(volume.VolumeId, token); published(await catalog.ReadRevisionAsync(token));
                    continue;
                }
                var inspection = await reader.InspectAsync(available, token);
                if (!IsContinuous(volume, inspection)) await RecoverAsync(reader, volume.VolumeId, token, "monitor-startup");
            }
            ready = await ReadReadyAsync(token);
            var roots = await resolveRoots(ready, token);
            var owners = new Dictionary<string, CatalogJournalPageOwner>(StringComparer.Ordinal);
            var entryRetries = new Dictionary<string, CatalogDirectoryEntryRetryOwner>(StringComparer.Ordinal);
            foreach (var volume in ready.Where(volume => native.ContainsKey(volume.VolumeId)))
            {
                owners.Add(volume.VolumeId, await CreateOwnerAsync(reader, native[volume.VolumeId], volume, roots, token));
                if (captureFileEntries) entryRetries.Add(volume.VolumeId, new(catalog, reader, native[volume.VolumeId], time));
            }
            if (owners.Count == 0) return;
            listening();
            var pending = new Queue<string>(); var queued = new HashSet<string>(StringComparer.Ordinal);
            var recoveries = 0;
            while (time.GetElapsedTime(started) < TimeSpan.FromMinutes(25)) {
                token.ThrowIfCancellationRequested();
                foreach (var retry in entryRetries.Values) if (await retry.StepAsync(token) is { } retryRevision) published(retryRevision);
                if (pending.Count == 0) {
                    var cursors = owners.Select(item => new ReaderJournalWaitCursor(native[item.Key].ReaderId,
                        ParseJournal(ready.Single(volume => volume.VolumeId == item.Key).JournalId!), item.Value.NextReadUsn)).ToArray();
                    var nextRetry = entryRetries.Values.Select(retry => retry.NextDue).DefaultIfEmpty(long.MaxValue).Min();
                    var timeout = (uint)Math.Clamp(nextRetry - time.GetUtcNow().ToUnixTimeMilliseconds(), 1, 30_000);
                    var wake = await reader.WaitForChangesAsync(cursors, timeout, token);
                    if (wake.TimedOut) continue;
                    foreach (var id in wake.ChangedVolumes) {
                        var key = native.Values.SingleOrDefault(volume => volume.ReaderId == id)?.CatalogId;
                        if (key is null || !owners.ContainsKey(key)) throw new InvalidDataException("monitor-unrequested-wake-volume");
                        if (queued.Add(key)) pending.Enqueue(key);
                    }
                    if (pending.Count == 0) throw new InvalidDataException("monitor-empty-wake");
                }
                for (var step = 0; step < MaximumPagesPerTurn && pending.Count > 0; step++) {
                    var key = pending.Dequeue(); queued.Remove(key);
                    try {
                        var page = await reader.ReadJournalPageAsync(native[key], ParseJournal(ready.Single(volume => volume.VolumeId == key).JournalId!),
                            owners[key].NextReadUsn, ReaderProtocol.MaximumRecordsPerPage, token);
                        var result = await owners[key].ProcessAsync(page, token);
                        if (entryRetries.TryGetValue(key, out var retryOwner) && result.Published) retryOwner.NotifyJournalChange();
                        if (result.Published) published(result.CatalogRevision);
                        if (!page.EndOfStream && queued.Add(key)) pending.Enqueue(key);
                    }
                    catch (CatalogReaderDiscontinuityException) {
                        if (++recoveries > 3) throw new InvalidDataException("monitor-recovery-limit");
                        await RecoverAsync(reader, key, token);
                        ready = await ReadReadyAsync(token); roots = await resolveRoots(ready, token);
                        var recovered = ready.SingleOrDefault(volume => volume.VolumeId == key);
                        if (recovered is null) { owners.Remove(key); entryRetries.Remove(key); }
                        else {
                            owners[key] = await CreateOwnerAsync(reader, native[key], recovered, roots, token);
                            if (captureFileEntries) entryRetries[key] = new(catalog, reader, native[key], time);
                        }
                        if (owners.Count == 0) return;
                    }
                }
                if (pending.Count > 0) await Task.Delay(15, token);
            }
            // Dispose the authenticated session before reconnecting, well before
            // the Reader's 30-minute maximum session lifetime.
        }
    }
    private async Task<IReadOnlyList<CatalogV2VolumeSnapshot>> ReadReadyAsync(CancellationToken token) =>
        (await catalog.ReadVolumesAsync(token)).Where(volume => volume.Selected && volume.State == CatalogV2VolumeState.Ready).ToArray();
    private Task<CatalogJournalPageOwner> CreateOwnerAsync(ICatalogReaderSession reader, CatalogReaderVolume native,
        CatalogV2VolumeSnapshot volume, IReadOnlyList<FileFactOwnedStorageRoot> roots, CancellationToken token) =>
        CatalogJournalPageOwner.CreateAsync(catalog, volume, roots, token,
            captureFileEntries ? new CatalogDirectoryEntryCapture(reader, native, true).CaptureJournalAsync : null);
    private async Task RecoverAsync(ICatalogReaderSession reader, string volumeId, CancellationToken token, string origin = "monitor-recovery")
    {
        await synchronization.SynchronizeConnectedAsync(reader, [volumeId], true, token, origin);
        published(await catalog.ReadRevisionAsync(token));
    }
    private static bool IsContinuous(CatalogV2VolumeSnapshot volume, CatalogReaderInspection inspection) =>
        volume.JournalId is not null && ParseJournal(volume.JournalId) == inspection.JournalId && volume.CheckpointUsn is { } checkpoint
        && checkpoint >= inspection.FirstUsn && checkpoint >= inspection.LowestValidUsn && checkpoint <= inspection.NextUsn;
    private static ulong ParseJournal(string journal) => ulong.Parse(journal, System.Globalization.NumberStyles.AllowHexSpecifier, System.Globalization.CultureInfo.InvariantCulture);
}
