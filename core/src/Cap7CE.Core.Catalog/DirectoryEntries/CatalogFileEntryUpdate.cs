namespace Cap7CE.Core.Catalog.DirectoryEntries;

public sealed record CatalogFileEntryUpdate(CatalogEntryIdentity Identity, CatalogFileEntrySource Source,
    IReadOnlyList<CatalogFileName> Names);
public sealed record CatalogFileEntryChanges(IReadOnlyList<CatalogV2NodeRecord> Nodes,
    IReadOnlyList<CatalogFileEntryUpdate> Entries);
