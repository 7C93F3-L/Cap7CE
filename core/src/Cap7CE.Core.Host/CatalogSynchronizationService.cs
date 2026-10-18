using Cap7CE.Core.Catalog;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Host;

public sealed record CatalogSynchronizationMeasurement(
    string Kind,
    long Records,
    int Pages,
    double ReaderReadMilliseconds,
    double StagingWriteMilliseconds,
    double DirectoryPathMilliseconds,
    double PublishMilliseconds,
    double TotalMilliseconds);

public sealed class CatalogSynchronizationService
{
    private readonly CatalogV2Database catalog;
    private readonly ICatalogReaderSessionFactory readerFactory;
    private readonly CatalogPreparationDiagnostics? diagnostics;
    private readonly bool captureFileEntries;

    public CatalogSynchronizationService(
        CatalogV2Database catalog,
        ICatalogReaderSessionFactory readerFactory, CatalogPreparationDiagnostics? diagnostics = null, bool captureFileEntries = false)
    {
        this.catalog = catalog;
        this.readerFactory = readerFactory;
        this.diagnostics = diagnostics;
        this.captureFileEntries = captureFileEntries;
    }

    public async Task<IReadOnlyList<CatalogV2VolumeSnapshot>> DiscoverAsync(
        CancellationToken token = default)
    {
        await using var reader = await readerFactory.ConnectAsync(token);
        var discovered = await reader.ListVolumesAsync(token);
        var existing = (await catalog.ReadVolumesAsync(token))
            .ToDictionary(volume => volume.VolumeId, StringComparer.Ordinal);
        foreach (var volume in discovered)
        {
            await catalog.RegisterVolumeAsync(
                volume.CatalogId,
                volume.DisplayName,
                "NTFS",
                existing.TryGetValue(volume.CatalogId, out var stored) && stored.Selected,
                token);
        }
        return await catalog.ReadVolumesAsync(token);
    }

    public async Task<IReadOnlyList<CatalogSynchronizationMeasurement>> SynchronizeAsync(
        IReadOnlyList<string> requestedVolumeIds,
        bool forceRebuild,
        CancellationToken token = default)
    {
        await using var reader = await readerFactory.ConnectAsync(token);
        return await SynchronizeConnectedAsync(reader, requestedVolumeIds, forceRebuild, token);
    }

    // The exclusive maintenance owner reuses its authenticated session during
    // recovery; this method never connects or disposes a competing Reader.
    public async Task<IReadOnlyList<CatalogSynchronizationMeasurement>> SynchronizeConnectedAsync(
        ICatalogReaderSession reader, IReadOnlyList<string> requestedVolumeIds, bool forceRebuild, CancellationToken token = default, string origin = "explicit")
    {
        ArgumentNullException.ThrowIfNull(reader); ArgumentNullException.ThrowIfNull(requestedVolumeIds);
        if (captureFileEntries) {
            if (!reader.SupportsFileEntryNames) throw new NotSupportedException("reader-entry-names-unavailable");
            await new Cap7CE.Core.Catalog.DirectoryEntries.CatalogFileEntryStore(catalog).InitializeAsync(token);
        }
        var requested = requestedVolumeIds.ToArray();
        var readerVolumes = (await reader.ListVolumesAsync(token))
            .ToDictionary(volume => volume.CatalogId, StringComparer.Ordinal);
        var catalogVolumes = await catalog.ReadVolumesAsync(token);
        var targets = catalogVolumes
            .Where(volume => volume.Selected
                && (requested.Length == 0 || requested.Contains(volume.VolumeId, StringComparer.Ordinal)))
            .ToArray();
        var measurements = new List<CatalogSynchronizationMeasurement>(targets.Length);
        foreach (var target in targets)
        {
            token.ThrowIfCancellationRequested();
            if (captureFileEntries && origin == "explicit") await new Cap7CE.Core.Catalog.DirectoryEntries.CatalogFileEntryPending(catalog).RearmAsync(target.VolumeId, token);
            if (!readerVolumes.TryGetValue(target.VolumeId, out var readerVolume))
            {
                await catalog.MarkOfflineAsync(target.VolumeId, token);
                continue;
            }
            var activity = diagnostics?.Begin(target.DisplayName, origin);
            try {
                measurements.Add(await SynchronizeVolumeAsync(reader, readerVolume, target, forceRebuild, activity, token));
                if (captureFileEntries) await new CatalogDirectoryEntryRetryOwner(catalog, reader, readerVolume).StepAsync(token);
                activity?.Complete(measurements[^1]);
            }
            catch (OperationCanceledException) { activity?.Cancel(); throw; }
            catch (Exception error) when (error is not OutOfMemoryException) { activity?.Fail(); throw; }
        }
        return measurements;
    }

    private async Task<CatalogSynchronizationMeasurement> SynchronizeVolumeAsync(
        ICatalogReaderSession reader,
        CatalogReaderVolume readerVolume,
        CatalogV2VolumeSnapshot catalogVolume,
        bool forceRebuild,
        CatalogPreparationDiagnostics.Activity? activity, CancellationToken token)
    {
        var inspection = await reader.InspectAsync(readerVolume, token);
        var reason = catalogVolume.State == CatalogV2VolumeState.Building ? "interrupted-build"
            : CatalogPreparationDiagnostics.RebuildReason(catalogVolume, inspection)
                ?? (forceRebuild ? "explicit-rebuild" : "marked-for-rebuild");
        if (forceRebuild && catalogVolume.State is not (CatalogV2VolumeState.Disabled or CatalogV2VolumeState.NeedsRebuild))
        {
            catalogVolume = await catalog.MarkNeedsRebuildAsync(catalogVolume.VolumeId, token);
        }
        if (catalogVolume.State == CatalogV2VolumeState.Building)
        {
            catalogVolume = await catalog.MarkNeedsRebuildAsync(catalogVolume.VolumeId, token);
        }
        if (catalogVolume.State is CatalogV2VolumeState.Disabled or CatalogV2VolumeState.NeedsRebuild)
        {
            return await BuildSnapshotAsync(
                reader, readerVolume, catalogVolume, inspection,
                catalogVolume.State == CatalogV2VolumeState.NeedsRebuild,
                activity, reason, token);
        }

        if (catalogVolume.State != CatalogV2VolumeState.CatchingUp)
        {
            catalogVolume = await catalog.BeginCatchUpAsync(
                catalogVolume.VolumeId,
                inspection.JournalId.ToString("X16"),
                inspection.FirstUsn,
                inspection.LowestValidUsn,
                token);
        }
        if (catalogVolume.State == CatalogV2VolumeState.NeedsRebuild)
        {
            return await BuildSnapshotAsync(reader, readerVolume, catalogVolume, inspection, true, activity, reason, token);
        }

        try
        {
            return await CatchUpAsync(reader, readerVolume, catalogVolume, inspection, activity, token);
        }
        catch (CatalogReaderDiscontinuityException)
        {
            return await RetryOrRebuildAsync(reader, readerVolume, catalogVolume.VolumeId, activity, token);
        }
    }

    private async Task<CatalogSynchronizationMeasurement> RetryOrRebuildAsync(
        ICatalogReaderSession reader,
        CatalogReaderVolume readerVolume,
        string volumeId,
        CatalogPreparationDiagnostics.Activity? activity, CancellationToken token)
    {
        activity?.Retry();
        var current = await catalog.ReadVolumeAsync(volumeId, token)
            ?? throw new InvalidDataException("catalog-volume-missing");
        var inspection = await reader.InspectAsync(readerVolume, token);
        if (CanResumeCatchUp(current, inspection))
        {
            try
            {
                return await CatchUpAsync(reader, readerVolume, current, inspection, activity, token);
            }
            catch (CatalogReaderDiscontinuityException)
            {
                current = await catalog.ReadVolumeAsync(volumeId, token)
                    ?? throw new InvalidDataException("catalog-volume-missing");
                inspection = await reader.InspectAsync(readerVolume, token);
            }
        }
        current = await catalog.MarkNeedsRebuildAsync(current.VolumeId, token);
        return await BuildSnapshotAsync(reader, readerVolume, current, inspection, true, activity, CatalogPreparationDiagnostics.RebuildReason(current, inspection) ?? "journal-discontinuity", token);
    }

    private static bool CanResumeCatchUp(
        CatalogV2VolumeSnapshot volume,
        CatalogReaderInspection inspection) =>
        volume.State == CatalogV2VolumeState.CatchingUp
        && string.Equals(volume.JournalId, inspection.JournalId.ToString("X16"), StringComparison.Ordinal)
        && volume.CheckpointUsn is long checkpoint
        && checkpoint >= inspection.FirstUsn
        && checkpoint >= inspection.LowestValidUsn
        && checkpoint <= inspection.NextUsn;

    private async Task<CatalogSynchronizationMeasurement> BuildSnapshotAsync(
        ICatalogReaderSession reader,
        CatalogReaderVolume readerVolume,
        CatalogV2VolumeSnapshot volume,
        CatalogReaderInspection inspection,
        bool rebuild,
        CatalogPreparationDiagnostics.Activity? activity, string reason, CancellationToken token)
    {
        var totalWatch = System.Diagnostics.Stopwatch.StartNew();
        var readerReadMilliseconds = 0d;
        var readerWatch = System.Diagnostics.Stopwatch.StartNew();
        activity?.Rebuild(rebuild ? reason : "initial-build");
        activity?.Stage("snapshot-open");
        var snapshot = await reader.OpenSnapshotAsync(readerVolume, token);
        readerWatch.Stop();
        readerReadMilliseconds += readerWatch.Elapsed.TotalMilliseconds;
        CatalogV2SnapshotBuild? build = null;
        var snapshotClosed = false;
        CatalogV2SnapshotBuildResult? result = null;
        try
        {
            build = await catalog.BeginSnapshotBuildAsync(
                volume.VolumeId,
                snapshot.JournalId.ToString("X16"),
                snapshot.JournalStartingUsn,
                inspection.FirstUsn,
                inspection.LowestValidUsn,
                snapshot.RecordCount == 0 ? (long?)null : checked((long)snapshot.RecordCount),
                rebuild,
                token, captureFileEntries);
            activity?.Stage("snapshot-read-and-stage");
            var cursor = 0UL;
            for (var pageNumber = 0; pageNumber < 1_000_000; pageNumber++)
            {
                token.ThrowIfCancellationRequested();
                readerWatch.Restart();
                var page = await reader.ReadSnapshotPageAsync(
                    snapshot.SnapshotId,
                    cursor,
                    ReaderProtocol.MaximumRecordsPerPage,
                    token);
                readerWatch.Stop();
                readerReadMilliseconds += readerWatch.Elapsed.TotalMilliseconds;
                if (page.NextCursor < cursor || (!page.EndOfStream && page.NextCursor == cursor))
                {
                    throw new InvalidDataException("reader-snapshot-cursor-stalled");
                }
                if (page.Records.Count > 0)
                {
                    var nodes = page.Records.Select(record => ToCatalogNode(volume.VolumeId, record)).ToArray();
                    if (captureFileEntries) await build.AppendWithEntriesAsync(await new CatalogDirectoryEntryCapture(reader, readerVolume, true).CaptureSnapshotAsync(nodes, token), token);
                    else await build.AppendAsync(nodes, token);
                }
                cursor = page.NextCursor;
                if (page.EndOfStream) break;
                if (pageNumber == 999_999) throw new InvalidDataException("reader-snapshot-page-limit");
            }
            readerWatch.Restart();
            await reader.CloseSnapshotAsync(snapshot.SnapshotId, CancellationToken.None);
            readerWatch.Stop();
            readerReadMilliseconds += readerWatch.Elapsed.TotalMilliseconds;
            snapshotClosed = true;
            activity?.Stage("directory-paths-and-publish");
            result = await build.PublishAsync(token);
        }
        finally
        {
            if (!snapshotClosed)
            {
                await reader.CloseSnapshotAsync(snapshot.SnapshotId, CancellationToken.None);
            }
            if (build is not null)
            {
                await build.DisposeAsync();
            }
        }
        totalWatch.Stop();
        return new CatalogSynchronizationMeasurement(
            rebuild ? "rebuild" : "initial",
            result!.Metrics.Records,
            result.Metrics.Pages,
            Math.Round(readerReadMilliseconds, 3),
            result.Metrics.StagingWriteMilliseconds,
            result.Metrics.DirectoryPathMilliseconds,
            result.Metrics.PublishMilliseconds,
            Math.Round(totalWatch.Elapsed.TotalMilliseconds, 3));
    }

    private async Task<CatalogSynchronizationMeasurement> CatchUpAsync(
        ICatalogReaderSession reader,
        CatalogReaderVolume readerVolume,
        CatalogV2VolumeSnapshot volume,
        CatalogReaderInspection inspection,
        CatalogPreparationDiagnostics.Activity? activity, CancellationToken token)
    {
        activity?.Stage("journal-catch-up");
        var totalWatch = System.Diagnostics.Stopwatch.StartNew();
        var readerReadMilliseconds = 0d;
        var records = 0L;
        var pages = 0;
        var targetUsn = inspection.NextUsn;
        var cursor = volume.CheckpointUsn
            ?? throw new InvalidDataException("catalog-checkpoint-missing");
        if (targetUsn < cursor) throw new CatalogReaderDiscontinuityException();
        for (var pageNumber = 0; pageNumber < 1_000_000; pageNumber++)
        {
            if (cursor >= targetUsn) break;
            token.ThrowIfCancellationRequested();
            var readerWatch = System.Diagnostics.Stopwatch.StartNew();
            var page = await reader.ReadJournalPageAsync(
                readerVolume,
                inspection.JournalId,
                cursor,
                ReaderProtocol.MaximumRecordsPerPage,
                token);
            readerWatch.Stop();
            readerReadMilliseconds += readerWatch.Elapsed.TotalMilliseconds;
            if (!page.Response.Continuous || page.Response.NextUsn < cursor
                || (!page.EndOfStream && page.Response.NextUsn == cursor))
            {
                throw new CatalogReaderDiscontinuityException();
            }
            var boundedRecords = page.Response.Records
                .Where(record => record.Usn < targetUsn)
                .ToArray();
            var nextCheckpoint = Math.Min(page.Response.NextUsn, targetUsn);
            var nodes = boundedRecords.Select(record => ToCatalogNode(volume.VolumeId, record)).ToArray();
            var entries = captureFileEntries ? await new CatalogDirectoryEntryCapture(reader, readerVolume, true).CaptureJournalAsync(nodes, boundedRecords, token) : null;
            volume = await catalog.ApplyBatchAsync(new CatalogV2WriteBatch(
                volume.VolumeId,
                volume.JournalId,
                volume.CheckpointUsn,
                volume.CatalogRevision,
                nextCheckpoint,
                page.Response.FirstUsn,
                page.Response.LowestValidUsn,
                entries?.Nodes ?? nodes, entries?.Entries, entries?.Deferred), token);
            records = checked(records + boundedRecords.Length);
            pages++;
            cursor = nextCheckpoint;
            if (cursor >= targetUsn) break;
            if (page.EndOfStream) throw new CatalogReaderDiscontinuityException();
            if (pageNumber == 999_999) throw new InvalidDataException("reader-journal-page-limit");
        }
        await catalog.CompleteSynchronizationAsync(volume.VolumeId, token);
        totalWatch.Stop();
        return new CatalogSynchronizationMeasurement(
            "incremental",
            records,
            pages,
            Math.Round(readerReadMilliseconds, 3),
            0,
            0,
            0,
            Math.Round(totalWatch.Elapsed.TotalMilliseconds, 3));
    }

    private static CatalogV2NodeRecord ToCatalogNode(string volumeId, ReaderMftRecordV2 record) => new(
        new CatalogEntryIdentity(volumeId, CatalogV2Database.EncodeFileReference(record.FileReference)),
        CatalogV2Database.EncodeFileReference(record.ParentFileReference),
        record.Name,
        record.Extension,
        record.IsDirectory,
        record.Attributes,
        true,
        record.IsDirectory || record.SizeBytes > long.MaxValue ? null : (long?)record.SizeBytes,
        ValidTime(record.CreationFileTimeUtc),
        ValidTime(record.LastWriteFileTimeUtc));

    private static CatalogV2NodeRecord ToCatalogNode(string volumeId, ReaderJournalRecordV2 record) => new(
        new CatalogEntryIdentity(volumeId, CatalogV2Database.EncodeFileReference(record.FileReference)),
        CatalogV2Database.EncodeFileReference(record.ParentFileReference),
        string.IsNullOrEmpty(record.Name) ? "unknown" : record.Name,
        record.Extension,
        record.IsDirectory,
        record.Attributes,
        record.Exists,
        record.IsDirectory || record.SizeBytes > long.MaxValue ? null : (long?)record.SizeBytes,
        ValidTime(record.CreationFileTimeUtc),
        ValidTime(record.LastWriteFileTimeUtc),
        InvalidatesFileFacts: CatalogFactChangeClassifier.Invalidates(record.Reason),
        MayChangeFileFormat: CatalogFactChangeClassifier.MayChangeFormat(record.Reason));

    private static long? ValidTime(long? value) => value is >= 0 ? value : null;
}
