using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host.MetadataScheduling;

// Reuse existing Catalog contracts; lifecycle validation never inspects source content.
public interface IMetadataBuildCatalog
{
    Task<CatalogStatusResponse> ReadStatusAsync(CancellationToken token);
    Task<CatalogResolveScopeResponse> ResolveScopeAsync(CatalogResolveScopeRequest request, CancellationToken token);
}
