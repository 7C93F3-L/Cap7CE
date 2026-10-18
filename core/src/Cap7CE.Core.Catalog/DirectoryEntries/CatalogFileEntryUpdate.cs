namespace Cap7CE.Core.Catalog.DirectoryEntries;

public sealed record CatalogFileEntryUpdate(CatalogEntryIdentity Identity, CatalogFileEntrySource Source,
    IReadOnlyList<CatalogFileName> Names);
public sealed record CatalogFileEntryChanges(IReadOnlyList<CatalogV2NodeRecord> Nodes,
    IReadOnlyList<CatalogFileEntryUpdate> Entries, IReadOnlyList<CatalogFileEntryDeferred>? Deferred = null);
public sealed record CatalogFileEntryDeferred(CatalogV2NodeRecord Node, uint Reason);
public sealed record CatalogFileEntryPendingPage(IReadOnlyList<CatalogFileEntryDeferred> Items, long NextRetryAt, long Waiting, long Blocked);
