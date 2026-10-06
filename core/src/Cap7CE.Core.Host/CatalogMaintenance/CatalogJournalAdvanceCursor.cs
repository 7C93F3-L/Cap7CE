using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Host.CatalogMaintenance;

public sealed class CatalogJournalAdvanceBatch
{
    internal CatalogJournalAdvanceBatch(long persistedUsn, long startingUsn, long nextUsn, ReaderJournalRecordV2[] records)
    {
        PersistedUsn = persistedUsn; StartingUsn = startingUsn; NextUsn = nextUsn;
        Records = Array.AsReadOnly(records);
    }
    public long PersistedUsn { get; }
    public long StartingUsn { get; }
    public long NextUsn { get; }
    public IReadOnlyList<ReaderJournalRecordV2> Records { get; }
    public bool RequiresCatalogWrite => Records.Count != 0;
}

// Per-volume owner state only. Own-storage-only pages advance in memory without
// producing another database/WAL write; after restart the persisted prefix is
// safely replayed. External changes advance only after the Catalog commit.
public sealed class CatalogJournalAdvanceCursor
{
    private readonly ulong journalId;
    private CatalogJournalAdvanceBatch? prepared;
    public CatalogJournalAdvanceCursor(ulong journalId, long persistedUsn)
    {
        if (journalId == 0 || persistedUsn < 0) throw new ArgumentException("Invalid journal cursor.");
        this.journalId = journalId; PersistedUsn = NextReadUsn = persistedUsn;
    }
    public long PersistedUsn { get; private set; }
    public long NextReadUsn { get; private set; }

    public CatalogJournalAdvanceBatch Prepare(CatalogReaderJournalPage page, Func<ReaderJournalRecordV2, bool> isOwnedStorage)
    {
        ArgumentNullException.ThrowIfNull(page); ArgumentNullException.ThrowIfNull(isOwnedStorage);
        var response = page.Response;
        if (response.JournalId != journalId || !response.Continuous || response.FirstUsn > NextReadUsn
            || response.LowestValidUsn > NextReadUsn || response.NextUsn < NextReadUsn
            || (!page.EndOfStream && response.NextUsn == NextReadUsn)) throw new CatalogReaderDiscontinuityException();
        if (response.Records is null || response.Records.Count > ReaderProtocol.MaximumRecordsPerPage)
            throw new InvalidDataException("journal-record-bound");
        var retained = new List<ReaderJournalRecordV2>();
        var previous = NextReadUsn;
        foreach (var record in response.Records) {
            if (record is null || record.Usn < previous || record.Usn >= response.NextUsn)
                throw new InvalidDataException("journal-record-cursor");
            previous = record.Usn;
            if (!isOwnedStorage(record)) retained.Add(record);
        }
        return prepared = new(PersistedUsn, NextReadUsn, response.NextUsn, retained.ToArray());
    }

    public void CompleteVolatile(CatalogJournalAdvanceBatch batch)
    {
        RequirePrepared(batch);
        if (batch.RequiresCatalogWrite) throw new InvalidOperationException("external-journal-change-requires-commit");
        NextReadUsn = batch.NextUsn; prepared = null;
    }

    public void CompletePersisted(CatalogJournalAdvanceBatch batch, long committedCheckpointUsn)
    {
        RequirePrepared(batch);
        if (!batch.RequiresCatalogWrite || committedCheckpointUsn != batch.NextUsn)
            throw new InvalidOperationException("journal-checkpoint-commit-mismatch");
        PersistedUsn = NextReadUsn = committedCheckpointUsn; prepared = null;
    }
    private void RequirePrepared(CatalogJournalAdvanceBatch batch)
    {
        ArgumentNullException.ThrowIfNull(batch);
        if (!ReferenceEquals(batch, prepared) || batch.StartingUsn != NextReadUsn || batch.PersistedUsn != PersistedUsn)
            throw new InvalidOperationException("stale-journal-advance-batch");
    }
}
