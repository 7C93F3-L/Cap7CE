using Cap7CE.Core.Host.MetadataBuild;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Host.MetadataScheduling;
using Cap7CE.Core.Host.MetadataWorkers;

namespace Cap7CE.Core.Host.MetadataBuildHosting;

// Explicit lazy ownership switch, not an extraction grant. Legacy clients never attach this service.
public sealed class MetadataBuildService(FileFactHostSession session, IMetadataBuildCatalog catalog, NodeMetadataResources resources, string directory)
{
    private readonly object gate = new();
    private Task<MetadataBuildCoordinator>? attachment;
    private Task? stopping;
    private bool closed;
    public Task<MetadataBuildCoordinator> AttachAsync(CancellationToken token = default)
    {
        Task<MetadataBuildCoordinator> task;
        lock (gate) {
            if (closed) throw new InvalidOperationException("metadata-build-start-cancelled");
            task = attachment ??= Task.Run(async () => {
                var preferences = new MetadataBuildPreferencesFile(directory); var queue = new MetadataDirectoryQueueFile(directory);
                var specifications = await MetadataExtractorManifest.LoadAsync(resources.Root);
                var owner = await session.AttachBuildOwnerAsync();
                var global = new MetadataGlobalBuildOwner(owner, catalog, new(preferences), specifications);
                return new MetadataBuildCoordinator(global, owner, catalog, queue, specifications);
            });
        }
        return task.WaitAsync(token);
    }
    public Task<MetadataBuildCoordinator> GetAsync(CancellationToken token)
    {
        lock (gate) {
            if (closed) throw new InvalidOperationException("metadata-build-start-cancelled");
            return (attachment ?? throw new InvalidOperationException("metadata-build-not-attached")).WaitAsync(token);
        }
    }
    public Task ShutdownAsync()
    {
        lock (gate) {
            closed = true; var task = attachment;
            return stopping ??= Task.Run(async () => {
                if (task is null) return; MetadataBuildCoordinator owner;
                try { owner = await task; } catch (Exception error) when (error is not OutOfMemoryException) { return; }
                await owner.ShutdownAsync();
            });
        }
    }
}
