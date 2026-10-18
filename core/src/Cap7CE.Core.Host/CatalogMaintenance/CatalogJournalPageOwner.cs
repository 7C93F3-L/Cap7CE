using System.Globalization;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.Queries;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Host.CatalogMaintenance;

public sealed record CatalogJournalPageResult(bool Published, long CatalogRevision, long NextReadUsn, int ExternalRecords);

// One selected ready volume inside the exclusive Reader owner. This class owns
// publication order, not the Reader connection or a polling timer. Any failure
// retires this instance; reconstruction starts from the durable checkpoint.
public sealed class CatalogJournalPageOwner
{
    private readonly CatalogV2Database catalog;
    private readonly CatalogStorageDirectoryReader ancestry;
    private readonly CatalogV2VolumeSnapshot initial;
    private readonly CatalogOwnedDirectoryIndex directories;
    private readonly CatalogOwnedDirectoryStage stage = new();
    private readonly CatalogJournalAdvanceCursor cursor;
    private readonly Action validateRoots;
    private readonly bool hasOwnedRoots;
    private readonly SemaphoreSlim gate = new(1, 1);
    private bool retired;
    private CatalogFileEntryCapture? captureEntries;

    private CatalogJournalPageOwner(CatalogV2Database catalog, CatalogV2VolumeSnapshot initial,
        CatalogOwnedDirectoryIndex directories, Action validateRoots, bool hasOwnedRoots)
    {
        this.catalog = catalog; this.initial = initial; this.directories = directories;
        this.validateRoots = validateRoots; this.hasOwnedRoots = hasOwnedRoots;
        ancestry = new(catalog);
        cursor = new(ulong.Parse(initial.JournalId!, NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture), initial.CheckpointUsn!.Value);
    }
    public long NextReadUsn => cursor.NextReadUsn;

    public static Task<CatalogJournalPageOwner> CreateAsync(CatalogV2Database catalog, CatalogV2VolumeSnapshot volume,
        IReadOnlyList<FileFactOwnedStorageRoot> roots, CancellationToken token = default, CatalogFileEntryCapture? captureEntries = null)
    {
        var copied = roots.ToArray();
        return CreateVerifiedAsync(catalog, volume, copied.Where(root => root.Identity.VolumeId == volume.VolumeId)
            .Select(root => root.Identity.FileReference).ToArray(), () => FileFactOwnedStorage.Validate(copied), token, captureEntries);
    }

    private static async Task<CatalogJournalPageOwner> CreateVerifiedAsync(CatalogV2Database catalog, CatalogV2VolumeSnapshot volume,
        IReadOnlyList<string> roots, Action validateRoots, CancellationToken token, CatalogFileEntryCapture? captureEntries)
    {
        if (!volume.Selected || volume.State != CatalogV2VolumeState.Ready || volume.CheckpointUsn is null or < 0
            || !ulong.TryParse(volume.JournalId, NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out var journal) || journal == 0)
            throw new InvalidOperationException("journal-owner-requires-ready-checkpoint");
        validateRoots();
        var copied = roots.ToArray(); var revision = await catalog.ReadRevisionAsync(token);
        var lookup = new CatalogStorageDirectoryReader(catalog); var links = new List<CatalogStorageDirectoryLink>();
        string? after = null;
        if (copied.Length > 0) do {
            var page = await lookup.ReadOwnedPageAsync(volume.VolumeId, copied, revision, after, 512, token);
            links.AddRange(page.Directories); after = page.Next;
        } while (after is not null);
        else await lookup.ReadParentsAsync(volume.VolumeId, [], revision, token);
        if (copied.Any(root => !links.Any(link => string.Equals(link.FileReference, root, StringComparison.OrdinalIgnoreCase))))
            throw new InvalidOperationException("owned-storage-root-not-in-catalog");
        validateRoots();
        return new(catalog, volume, new(copied, links), validateRoots, copied.Length > 0) { captureEntries = captureEntries };
    }

    public async Task<CatalogJournalPageResult> ProcessAsync(CatalogReaderJournalPage page, CancellationToken token = default)
    {
        await gate.WaitAsync(token);
        try {
            if (retired) throw new InvalidOperationException("journal-page-owner-retired");
            token.ThrowIfCancellationRequested(); validateRoots();
            // Validate raw page before mutating the directory classifier or stage.
            cursor.Prepare(page, _ => false);
            var revision = await catalog.ReadRevisionAsync(token);
            var current = await catalog.ReadVolumeAsync(initial.VolumeId, token);
            if (current is null || !current.Selected || current.State != CatalogV2VolumeState.Ready
                || current.JournalId != initial.JournalId || current.CheckpointUsn != cursor.PersistedUsn)
                throw new CatalogConcurrencyException("journal-owner-checkpoint-changed");
            var previous = await ancestry.ReadParentsAsync(initial.VolumeId, hasOwnedRoots
                ? page.Response.Records.Select(record => CatalogV2Database.EncodeFileReference(record.FileReference)).Distinct().ToArray() : [], revision, token);
            var partition = directories.Partition(page.Response.Records, previous);
            if (partition.DirectoryMovedOutside) throw new CatalogReaderDiscontinuityException();
            stage.Retain(partition.OwnedDirectoryRecords);
            var external = new HashSet<ReaderJournalRecordV2>(partition.ExternalRecords, ReferenceEqualityComparer.Instance);
            var advance = cursor.Prepare(page, record => !external.Contains(record));
            if (!advance.RequiresCatalogWrite) {
                cursor.CompleteVolatile(advance);
                return new(false, revision, cursor.NextReadUsn, 0);
            }
            var publication = stage.Prepare(initial.VolumeId, advance.Records);
            var entries = captureEntries is null ? null : await captureEntries(publication.Nodes, advance.Records, token);
            var committed = await catalog.ApplyMaintenanceBatchAsync(new(initial.VolumeId, initial.JournalId,
                advance.PersistedUsn, revision, advance.NextUsn, page.Response.FirstUsn, page.Response.LowestValidUsn, entries?.Nodes ?? publication.Nodes, entries?.Entries, entries?.Deferred), token);
            cursor.CompletePersisted(advance, committed.CheckpointUsn!.Value); stage.Complete(publication);
            return new(true, committed.CatalogRevision, cursor.NextReadUsn, advance.Records.Count);
        }
        catch { retired = true; throw; }
        finally { gate.Release(); }
    }
}
