using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Reader.Host;

// Only the latest MFT page. Single-link names reuse its already-read attribute
// stamp; journal inspection, the next page and snapshot closure invalidate it.
internal sealed class ReaderSnapshotEntryCache
{
    private readonly Dictionary<ulong, ReaderFileEntrySet> files = [];
    public void Clear() => files.Clear();
    public ReaderFileEntrySet? Read(ulong reference) => files.GetValueOrDefault(reference);
    public void Add(ReaderMftRecord record, ReaderBasicFacts? facts)
    {
        if (record.IsDirectory || facts is null || facts.NumberOfLinks != 1 || facts.SizeBytes is null
            || (facts.Attributes & 0x00441410) != 0 || facts.CreationFileTimeUtc < 0 || facts.LastWriteFileTimeUtc < 0) return;
        if (files.Count >= ReaderProtocol.MaximumRecordsPerPage) throw new InvalidDataException("reader-snapshot-entry-cache-bound");
        var file = new ReaderFileEntrySet(record.FileReference, ReaderFileEntryState.Complete, 1,
            facts.SizeBytes, facts.CreationFileTimeUtc, facts.LastWriteFileTimeUtc, [new(record.ParentFileReference, record.Name)]);
        try { _ = ReaderPayloadCodec.MeasureFileEntrySet(file); }
        catch (ReaderProtocolException) { return; }
        files[record.FileReference] = file;
    }
}
