namespace Cap7CE.Core.Catalog;

public static class CatalogV2Contract
{
    public const int SchemaVersion = 2;
    public const int MaximumBatchNodes = 10_000;
    public const int MaximumPageSize = 200;
    public const int MaximumQueryTerms = 16;
    public const string PathStrategy = "directory-path-cache";
}

public enum CatalogV2VolumeState
{
    Disabled,
    Building,
    Ready,
    CatchingUp,
    Offline,
    NeedsRebuild
}

public enum CatalogEntryType
{
    Any,
    File,
    Directory
}

public enum CatalogQueryScopeKind
{
    AllVolumes,
    DirectoryDescendants,
    DirectChildren,
    SavedScope
}

public sealed record CatalogEntryIdentity(string VolumeId, string FileReference);

public sealed record CatalogV2NodeRecord(
    CatalogEntryIdentity Identity,
    string? ParentFileReference,
    string Name,
    string Extension,
    bool IsDirectory,
    long Attributes,
    bool Exists,
    long? SizeBytes,
    long? CreatedUtcTicks,
    long? ModifiedUtcTicks,
    bool InvalidatesFileFacts = false,
    bool MayChangeFileFormat = false,
    bool SuppressFileFactChangeHint = false);

public sealed record CatalogV2VolumeSnapshot(
    string VolumeId,
    string DisplayName,
    string FileSystem,
    bool Selected,
    string? JournalId,
    long? CheckpointUsn,
    long? JournalFirstUsn,
    long? JournalLowestValidUsn,
    CatalogV2VolumeState State,
    long Processed,
    long? Total,
    long CatalogRevision);

public sealed record CatalogV2WriteBatch(
    string VolumeId,
    string? ExpectedJournalId,
    long? ExpectedCheckpointUsn,
    long ExpectedCatalogRevision,
    long NextCheckpointUsn,
    long? JournalFirstUsn,
    long? JournalLowestValidUsn,
    IReadOnlyList<CatalogV2NodeRecord> Nodes,
    IReadOnlyList<DirectoryEntries.CatalogFileEntryUpdate>? FileEntries = null,
    IReadOnlyList<DirectoryEntries.CatalogFileEntryDeferred>? DeferredEntries = null,
    long? EntryRetryAtUnixMilliseconds = null);

public sealed record CatalogQueryScope(
    CatalogQueryScopeKind Kind,
    string? VolumeId = null,
    string? RootFileReference = null,
    string? SavedScopeId = null)
{
    public static CatalogQueryScope AllVolumes() => new(CatalogQueryScopeKind.AllVolumes);
    public static CatalogQueryScope Descendants(string volumeId, string rootFileReference) =>
        new(CatalogQueryScopeKind.DirectoryDescendants, volumeId, rootFileReference);
    public static CatalogQueryScope DirectChildren(string volumeId, string rootFileReference) =>
        new(CatalogQueryScopeKind.DirectChildren, volumeId, rootFileReference);
    public static CatalogQueryScope Saved(string scopeId) =>
        new(CatalogQueryScopeKind.SavedScope, SavedScopeId: scopeId);
}

public sealed record CatalogQueryCursorKey(
    string Name,
    string VolumeId,
    string FileReference, long? ModifiedUtcTicks = null, bool? IsDirectory = null, long? RandomScore = null, string? EntryKey = null);

public enum CatalogQueryTextTarget { Name, Path, NameOrPath, NamePathOrKeywords }
public sealed record CatalogQueryRevision(long CatalogRevision, long? FactRevision = null);

public sealed record CatalogV2Query(
    string Query,
    IReadOnlyList<string> VolumeIds,
    CatalogQueryScope Scope,
    string? Extension,
    CatalogEntryType EntryType,
    int PageSize,
    CatalogQueryCursorKey? After,
    FileFacts.FileFactQueryFilter? Facts = null,
    CatalogQueryTextTarget TextTarget = CatalogQueryTextTarget.Name,
    CatalogQueryRevision? ExpectedRevision = null,
    CatalogFileConditions? FileConditions = null, CatalogQuerySort Sort = CatalogQuerySort.NameAscending, bool ExcludeHidden = false, uint? RandomSeed = null);

public sealed record CatalogV2QueryItem(
    CatalogEntryIdentity Identity,
    string Name,
    string RelativePath,
    string Extension,
    bool IsDirectory,
    long Attributes,
    long? SizeBytes,
    long? CreatedUtcTicks,
    long? ModifiedUtcTicks, string? EntryKey = null);

public sealed record CatalogV2QueryPage(
    IReadOnlyList<CatalogV2QueryItem> Items,
    CatalogQueryCursorKey? Next,
    long CatalogRevision,
    long? FactRevision = null);

public sealed record CatalogResolvedDirectory(
    CatalogEntryIdentity Identity,
    string RelativePath);

public sealed record CatalogSavedScope(
    string ScopeId,
    CatalogEntryIdentity Root,
    long CreatedUtcTicks);

public sealed record CatalogPathStrategyMeasurement(
    string Strategy,
    long StoredUtf8Bytes,
    long MoveInvalidations,
    double LookupMilliseconds);

public sealed record CatalogPathStrategyReport(
    string SelectedStrategy,
    IReadOnlyList<CatalogPathStrategyMeasurement> Measurements);
