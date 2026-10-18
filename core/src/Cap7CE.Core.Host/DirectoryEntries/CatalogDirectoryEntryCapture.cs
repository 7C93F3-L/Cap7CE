using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Host;

public delegate Task<CatalogFileEntryChanges> CatalogFileEntryCapture(IReadOnlyList<CatalogV2NodeRecord> nodes,
    IReadOnlyList<ReaderJournalRecordV2> records, CancellationToken token);

// Metadata is gathered before the Catalog transaction. The existing volume/revision
// fences reject concurrent writers; unknown liveness must never turn into deletion.
public sealed class CatalogDirectoryEntryCapture(ICatalogReaderSession reader, CatalogReaderVolume volume)
{
    public Task<CatalogFileEntryChanges> CaptureJournalAsync(IReadOnlyList<CatalogV2NodeRecord> nodes,
        IReadOnlyList<ReaderJournalRecordV2> records, CancellationToken token) => CaptureAsync(nodes, false,
            records.GroupBy(record => record.FileReference).ToDictionary(group => group.Key,
                group => group.Aggregate(0u, (reason, record) => reason | record.Reason)), token);

    public Task<CatalogFileEntryChanges> CaptureSnapshotAsync(IReadOnlyList<CatalogV2NodeRecord> nodes, CancellationToken token) =>
        CaptureAsync(nodes, true, new Dictionary<ulong, uint>(), token);

    private async Task<CatalogFileEntryChanges> CaptureAsync(IReadOnlyList<CatalogV2NodeRecord> nodes, bool snapshot,
        IReadOnlyDictionary<ulong, uint> reasons, CancellationToken token)
    {
        if (!reader.SupportsFileEntryNames) throw new NotSupportedException("reader-entry-names-unavailable");
        if (nodes.Count > CatalogV2Contract.MaximumBatchNodes || nodes.Any(node => node.Identity.VolumeId != volume.CatalogId))
            throw new ArgumentException("Entry capture requires a bounded single-volume page.");
        var latest = nodes.GroupBy(node => node.Identity).Select(group => group.Last()).ToArray();
        var observed = new Dictionary<ulong, ReaderFileEntrySet>();
        foreach (var chunk in latest.Where(node => !node.IsDirectory).Chunk(64)) {
            token.ThrowIfCancellationRequested();
            var references = chunk.Select(node => Convert.ToUInt64(node.Identity.FileReference, 16)).ToArray();
            var files = await reader.ReadFileEntriesAsync(volume, references, token);
            if (!files.Select(file => file.FileReference).SequenceEqual(references)) throw new ReaderProtocolException("unrequested-entry-reference");
            foreach (var file in files) { _ = ReaderPayloadCodec.MeasureFileEntrySet(file); observed.Add(file.FileReference, file); }
        }
        var result = new List<CatalogV2NodeRecord>(); var updates = new List<CatalogFileEntryUpdate>();
        foreach (var node in latest) {
            if (node.IsDirectory) { result.Add(node); continue; }
            var reference = Convert.ToUInt64(node.Identity.FileReference, 16); var file = observed[reference];
            if (file.State == ReaderFileEntryState.Missing) {
                if (!snapshot) result.Add(node with { Exists = false });
                continue;
            }
            if (file.State != ReaderFileEntryState.Complete || file.SizeBytes > long.MaxValue) {
                if (!snapshot) throw new CatalogFileEntryUnavailableException();
                result.Add(node); continue; // no complete observation; retain legacy/previous available names
            }
            var names = file.Names.Select(name => new CatalogFileName(CatalogV2Database.EncodeFileReference(name.ParentFileReference), name.Name)).ToArray();
            var chosen = names.FirstOrDefault(name => name.ParentFileReference == node.ParentFileReference && name.Name == node.Name)
                ?? names.OrderBy(name => name.ParentFileReference, StringComparer.Ordinal).ThenBy(name => name.Name, StringComparer.Ordinal).First();
            var extension = Path.GetExtension(chosen.Name).ToLowerInvariant();
            var reason = reasons.GetValueOrDefault(reference) & ~0x00000200u;
            var current = node with { Exists = true, Name = chosen.Name, ParentFileReference = chosen.ParentFileReference,
                Extension = extension.Length <= 64 ? extension : "", SizeBytes = checked((long)file.SizeBytes!.Value),
                CreatedUtcTicks = file.CreationFileTimeUtc, ModifiedUtcTicks = file.LastWriteFileTimeUtc,
                InvalidatesFileFacts = CatalogFactChangeClassifier.Invalidates(reason), MayChangeFileFormat = CatalogFactChangeClassifier.MayChangeFormat(reason) };
            result.Add(current); updates.Add(new(node.Identity, new(current.CreatedUtcTicks, current.ModifiedUtcTicks, current.SizeBytes), names));
        }
        token.ThrowIfCancellationRequested();
        return new(result.AsReadOnly(), updates.AsReadOnly());
    }
}

public sealed class CatalogFileEntryUnavailableException : IOException
{
    public CatalogFileEntryUnavailableException() : base("reader-entry-metadata-unavailable") { }
}
