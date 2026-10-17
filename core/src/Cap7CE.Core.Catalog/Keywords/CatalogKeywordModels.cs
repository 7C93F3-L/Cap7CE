namespace Cap7CE.Core.Catalog.Keywords;

public sealed record CatalogKeywordIdentity(string VolumeId, string FileReference, string? CreatedFileTimeMilliseconds);
public sealed record CatalogKeywordSnapshot(IReadOnlyList<string> Keywords, string? Revision);
public sealed record CatalogKeywordWriteResult(bool Saved, CatalogKeywordSnapshot Current, long CatalogRevision);
public sealed record CatalogLegacyKeywords(string Path, IReadOnlyList<string> Keywords, string CreatedFileTimeMilliseconds);
public sealed record CatalogKeywordImportResult(int Imported, long CatalogRevision);
