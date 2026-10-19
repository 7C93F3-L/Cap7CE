using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataBuild;

namespace Cap7CE.Core.Host.MetadataScheduling;

internal static class MetadataDirectoryScopeResolver
{
    internal static async Task<FileFactScope> ResolveAsync(MetadataDirectoryJob job, IMetadataBuildCatalog catalog,
        CancellationToken token, Action waiting, int waitMilliseconds)
    {
        while (true) {
            token.ThrowIfCancellationRequested(); var status = await catalog.ReadStatusAsync(token);
            var volume = status.Volumes.FirstOrDefault(volume => volume.DisplayName.Length >= 2 && string.Equals(volume.DisplayName[..2], job.Path[..2], StringComparison.OrdinalIgnoreCase));
            if (volume?.Selected != true) throw new InvalidOperationException("metadata-directory-unavailable");
            var scope = await catalog.ResolveScopeAsync(new(job.Path), token); token.ThrowIfCancellationRequested();
            if (scope.Resolved && scope.Queryable && scope.VolumeId is not null) {
                var previous = job.Scope;
                if (previous is not null && (!string.Equals(previous.VolumeId, scope.VolumeId, StringComparison.OrdinalIgnoreCase)
                    || !string.Equals(previous.RootFileReference, scope.RootFileReference, StringComparison.OrdinalIgnoreCase))) throw new InvalidOperationException("metadata-directory-changed");
                return new(scope.VolumeId, scope.RootFileReference);
            }
            if ((scope.State ?? volume.State) is not ("building" or "discovering" or "catchingUp")) throw new InvalidOperationException("metadata-directory-unavailable");
            waiting(); await Task.Delay(waitMilliseconds, token);
        }
    }
}
