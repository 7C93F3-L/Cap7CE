namespace Cap7CE.Core.Adapters;

public sealed record MetadataSearchPageRequest(
    string Query,
    long Offset,
    int PageSize,
    string Sort,
    IReadOnlyList<string> VolumeIds);

public sealed record MetadataSearchItem(
    string Id,
    string Name,
    string RelativePath,
    string Extension,
    bool IsDirectory);

public sealed record MetadataSearchPage(
    IReadOnlyList<MetadataSearchItem> Items,
    long? NextOffset);

public interface IMetadataSearchSource
{
    long CatalogRevision { get; }

    Task<MetadataSearchPage> ReadPageAsync(
        MetadataSearchPageRequest request,
        CancellationToken cancellationToken);
}
