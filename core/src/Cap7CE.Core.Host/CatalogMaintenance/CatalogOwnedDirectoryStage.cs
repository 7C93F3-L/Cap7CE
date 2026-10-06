using Cap7CE.Core.Catalog;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Host.CatalogMaintenance;

// Per-volume owner memory, bounded independently of the ancestry cache. It is
// cleared only after the matching Catalog transaction commits successfully.
public sealed class CatalogOwnedDirectoryStage
{
    public const int MaximumStagedDirectories = 4096;
    private readonly Dictionary<ulong, ReaderJournalRecordV2> pending = new();
    private CatalogOwnedDirectoryPublication? prepared;
    public int Count => pending.Count;

    public void Retain(IReadOnlyList<ReaderJournalRecordV2> records)
    {
        ArgumentNullException.ThrowIfNull(records);
        if (records.Count > ReaderProtocol.MaximumRecordsPerPage || records.Any(record => record is null || !record.IsDirectory))
            throw new ArgumentException("Only bounded owned directory events may be staged.");
        if (records.Select(record => record.FileReference).Concat(pending.Keys).Distinct().Count() > MaximumStagedDirectories)
            throw new CatalogReaderDiscontinuityException(); // owner performs completeness recovery, never a self-only flush
        foreach (var record in records) {
            if (!pending.TryGetValue(record.FileReference, out var previous) || record.Usn >= previous.Usn)
                pending[record.FileReference] = record;
        }
        prepared = null;
    }

    public CatalogOwnedDirectoryPublication Prepare(string volumeId, IReadOnlyList<ReaderJournalRecordV2> external)
    {
        ArgumentNullException.ThrowIfNull(external);
        if (external.Count is < 1 or > ReaderProtocol.MaximumRecordsPerPage)
            throw new ArgumentException("Publication requires a bounded external event page.");
        var externalIds = external.Select(record => record.FileReference).ToHashSet();
        var nodes = pending.Values.Concat(external).GroupBy(record => record.FileReference)
            .Select(group => group.OrderBy(record => record.Usn).Last() with { Reason = group.Aggregate(0u, (reason, record) => reason | record.Reason) })
            .OrderBy(record => record.Usn).Select(record => ToNode(volumeId, record, !externalIds.Contains(record.FileReference))).ToArray();
        return prepared = new(Array.AsReadOnly(nodes));
    }

    public void Complete(CatalogOwnedDirectoryPublication publication)
    {
        if (!ReferenceEquals(publication, prepared) || publication is null)
            throw new InvalidOperationException("stale-owned-directory-publication");
        pending.Clear(); prepared = null;
    }

    private static CatalogV2NodeRecord ToNode(string volumeId, ReaderJournalRecordV2 record, bool suppressHint) => new(
        new(volumeId, CatalogV2Database.EncodeFileReference(record.FileReference)),
        CatalogV2Database.EncodeFileReference(record.ParentFileReference), string.IsNullOrEmpty(record.Name) ? "unknown" : record.Name,
        record.Extension, record.IsDirectory, record.Attributes, record.Exists,
        !record.IsDirectory && record.SizeBytes is { } size && size <= long.MaxValue ? (long)size : null,
        record.CreationFileTimeUtc is >= 0 ? record.CreationFileTimeUtc : null,
        record.LastWriteFileTimeUtc is >= 0 ? record.LastWriteFileTimeUtc : null,
        InvalidatesFileFacts: !suppressHint && CatalogFactChangeClassifier.Invalidates(record.Reason),
        MayChangeFileFormat: !suppressHint && CatalogFactChangeClassifier.MayChangeFormat(record.Reason),
        SuppressFileFactChangeHint: suppressHint);
}

public sealed class CatalogOwnedDirectoryPublication
{
    internal CatalogOwnedDirectoryPublication(IReadOnlyList<CatalogV2NodeRecord> nodes) => Nodes = nodes;
    public IReadOnlyList<CatalogV2NodeRecord> Nodes { get; }
}
