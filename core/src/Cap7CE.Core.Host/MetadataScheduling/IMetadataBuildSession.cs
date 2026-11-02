using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataExtraction;

namespace Cap7CE.Core.Host.MetadataScheduling;

// In-process owned broker interface, shared by full and temporary directory sweeps. No second pipe/client.
public interface IMetadataBuildSession
{
    Task<FileFactHostStatus> ConfigureAsync(FileFactConfigurationRequest request, CancellationToken token);
    Task<FileFactHostStatus> PauseAsync(CancellationToken token);
    Task<FileFactDiscoveryPage> DiscoverAsync(FileFactDiscoveryRequest request, CancellationToken token);
    Task<FileFactChangeDispatchStep> ConsumeChangesAsync(FileFactConsumeChangesRequest request, CancellationToken token);
    Task<FileFactClaimResult> ClaimAsync(CancellationToken token, FileFactClaimSpecification? specification = null);
    Task<FileFactExecutionResult> ExecuteAsync(FileFactLeaseRequest request, CancellationToken token);
    Task<bool> IsVolumeAvailableAsync(string volume, CancellationToken token);
    Task<FileFactHostStatus> ReadStatusAsync(FileFactQueueStatusRequest request, CancellationToken token);
}
