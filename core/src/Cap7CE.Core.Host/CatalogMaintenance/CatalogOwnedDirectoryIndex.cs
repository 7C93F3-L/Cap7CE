using System.Globalization;
using Cap7CE.Core.Catalog.Queries;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Host.CatalogMaintenance;

public sealed record CatalogOwnedDirectoryPartition(IReadOnlyList<ReaderJournalRecordV2> ExternalRecords,
    IReadOnlyList<ReaderJournalRecordV2> OwnedDirectoryRecords, bool DirectoryMovedOutside);

// Per-volume directory identities only. Root identities are physically verified
// by the owner. A name match is never evidence of storage ownership.
public sealed class CatalogOwnedDirectoryIndex
{
    private readonly HashSet<ulong> roots;
    private readonly Dictionary<ulong, ulong?> parents;
    public CatalogOwnedDirectoryIndex(IReadOnlyList<string> roots, IReadOnlyList<CatalogStorageDirectoryLink> directories)
    {
        if (roots.Count > 32 || directories.Count > CatalogStorageDirectoryReader.MaximumOwnedDirectories) throw new ArgumentException("Owned directory index is too large.");
        this.roots = roots.Select(Parse).ToHashSet();
        if (this.roots.Contains(0)) throw new ArgumentException("Whole-volume ownership is not allowed.");
        parents = directories.ToDictionary(directory => Parse(directory.FileReference), directory => ParseNullable(directory.ParentFileReference));
    }
    public CatalogOwnedDirectoryPartition Partition(IReadOnlyList<ReaderJournalRecordV2> records, IReadOnlyDictionary<string, CatalogStorageParent> previousParents)
    {
        if (records.Count > ReaderProtocol.MaximumRecordsPerPage || previousParents.Count > ReaderProtocol.MaximumRecordsPerPage)
            throw new ArgumentException("Owned partition page is too large.");
        if (roots.Count == 0) return new(Array.AsReadOnly(records.ToArray()), [], false);
        var previous = previousParents.ToDictionary(item => Parse(item.Key), item => item.Value);
        var external = new List<ReaderJournalRecordV2>(); var ownedDirectories = new List<ReaderJournalRecordV2>(); var movedOutside = false;
        foreach (var record in records) {
            var parentOwned = IsOwned(record.ParentFileReference);
            var hasPrevious = previous.TryGetValue(record.FileReference, out var old) && old.Exists;
            var wasOwned = roots.Contains(record.FileReference) || (hasPrevious
                ? IsOwned(ParseNullable(old!.ParentFileReference)) : record.IsDirectory && IsOwned(record.FileReference));
            if (!roots.Contains(record.FileReference) && record.IsDirectory && (parentOwned || parents.ContainsKey(record.FileReference))) {
                if (!parents.ContainsKey(record.FileReference) && parents.Count >= CatalogStorageDirectoryReader.MaximumOwnedDirectories)
                    throw new InvalidDataException("owned-directory-index-too-large");
                parents[record.FileReference] = record.ParentFileReference;
            }
            // A previously external entry moving in must update its Catalog path.
            // New own entries and internal renames do not trigger database writes.
            if (!roots.Contains(record.FileReference) && (!parentOwned || (hasPrevious && !wasOwned))) external.Add(record);
            else if (record.IsDirectory) ownedDirectories.Add(record);
            if (record.IsDirectory && record.Exists && wasOwned && !parentOwned && !roots.Contains(record.FileReference)) movedOutside = true;
            previous[record.FileReference] = new(record.ParentFileReference.ToString("X16"), record.IsDirectory, record.Exists);
        }
        return new(external.AsReadOnly(), ownedDirectories.AsReadOnly(), movedOutside);
    }
    private bool IsOwned(ulong? reference)
    {
        var visited = new HashSet<ulong>();
        while (reference is { } current) {
            if (roots.Contains(current)) return true;
            if (!visited.Add(current) || visited.Count > 1024) throw new InvalidDataException("owned-directory-parent-cycle-or-depth");
            if (!parents.TryGetValue(current, out reference)) return false;
        }
        return false;
    }
    private static ulong? ParseNullable(string? reference) => reference is null ? null : Parse(reference);
    private static ulong Parse(string reference) => reference is { Length: 16 } && reference.All(char.IsAsciiHexDigit)
        ? ulong.Parse(reference, NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture) : throw new ArgumentException("Invalid owned directory reference.");
}
