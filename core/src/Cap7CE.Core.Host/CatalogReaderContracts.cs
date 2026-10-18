using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Host;

public sealed record CatalogReaderVolume(
    ReaderOpaqueId ReaderId,
    string CatalogId,
    string DisplayName,
    bool JournalAvailable);

public sealed record CatalogReaderInspection(
    ulong RecordCount,
    ulong JournalId,
    long FirstUsn,
    long LowestValidUsn,
    long NextUsn);

public sealed record CatalogReaderSnapshot(
    ReaderOpaqueId SnapshotId,
    ulong RecordCount,
    ulong JournalId,
    long JournalStartingUsn);

public sealed record CatalogReaderSnapshotPage(
    ulong NextCursor,
    bool EndOfStream,
    IReadOnlyList<ReaderMftRecordV2> Records);

public sealed record CatalogReaderJournalPage(
    bool EndOfStream,
    ReaderJournalReadBatchResponseV2 Response);

public interface ICatalogReaderSession : IAsyncDisposable
{
    bool SupportsJournalChangeWait => false;
    bool SupportsFileEntryNames => false;
    Task<IReadOnlyList<ReaderFileEntrySet>> ReadFileEntriesAsync(CatalogReaderVolume volume,
        IReadOnlyList<ulong> references, CancellationToken token) =>
        Task.FromException<IReadOnlyList<ReaderFileEntrySet>>(new NotSupportedException("reader-entry-names-unavailable"));
    Task<ReaderJournalWaitResponse> WaitForChangesAsync(IReadOnlyList<ReaderJournalWaitCursor> cursors, uint waitMilliseconds,
        CancellationToken token) => Task.FromException<ReaderJournalWaitResponse>(new NotSupportedException("reader-journal-wait-unavailable"));
    Task<IReadOnlyList<CatalogReaderVolume>> ListVolumesAsync(CancellationToken token);
    Task<CatalogReaderInspection> InspectAsync(CatalogReaderVolume volume, CancellationToken token);
    Task<CatalogReaderSnapshot> OpenSnapshotAsync(CatalogReaderVolume volume, CancellationToken token);
    Task<CatalogReaderSnapshotPage> ReadSnapshotPageAsync(
        ReaderOpaqueId snapshotId,
        ulong cursor,
        uint limit,
        CancellationToken token);
    Task CloseSnapshotAsync(ReaderOpaqueId snapshotId, CancellationToken token);
    Task<CatalogReaderJournalPage> ReadJournalPageAsync(
        CatalogReaderVolume volume,
        ulong journalId,
        long startingUsn,
        uint limit,
        CancellationToken token);
}

public interface ICatalogReaderSessionFactory
{
    Task<ICatalogReaderSession> ConnectAsync(CancellationToken token);
}

public sealed class CatalogReaderDiscontinuityException : Exception;
