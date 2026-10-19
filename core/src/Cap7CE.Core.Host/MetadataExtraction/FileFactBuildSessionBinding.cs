using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataScheduling;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host.MetadataExtraction;

// The existing session gate linearizes legacy activation and the new scheduler's attach.
// Attaching does not initialize a ledger, change policy or authorize source content.
public sealed partial class FileFactHostSession
{
    private bool buildOwnerAttached;
    public async Task<IMetadataBuildSession> AttachBuildOwnerAsync(CancellationToken token = default)
    {
        await gate.WaitAsync(token);
        try {
            if (initialized && !buildOwnerAttached) throw new CoreProtocolException(CoreErrorCodes.NotQueryable, "metadata-build-session-already-active");
            buildOwnerAttached = true; return this;
        }
        finally { gate.Release(); }
    }
    private void RequireOwner(bool buildOwner)
    {
        if (buildOwnerAttached != buildOwner) throw new CoreProtocolException(CoreErrorCodes.NotQueryable, "metadata-build-session-owner-changed");
    }
    Task<FileFactHostStatus> IMetadataBuildSession.ConfigureAsync(FileFactConfigurationRequest request, CancellationToken token) => ConfigureAsync(request, token, buildOwner: true);
    Task<FileFactHostStatus> IMetadataBuildSession.PauseAsync(CancellationToken token) => PauseAsync(token, buildOwner: true);
    Task<FileFactDiscoveryPage> IMetadataBuildSession.DiscoverAsync(FileFactDiscoveryRequest request, CancellationToken token) => DiscoverAsync(request, token, buildOwner: true);
    Task<FileFactChangeDispatchStep> IMetadataBuildSession.ConsumeChangesAsync(FileFactConsumeChangesRequest request, CancellationToken token) => ConsumeChangesAsync(request, token, buildOwner: true);
    Task<FileFactClaimResult> IMetadataBuildSession.ClaimAsync(CancellationToken token, FileFactClaimSpecification? specification) => ClaimAsync(token, specification, buildOwner: true);
    Task<FileFactExecutionResult> IMetadataBuildSession.ExecuteAsync(FileFactLeaseRequest request, CancellationToken token) => ExecuteAsync(request, token, buildOwner: true);
}
