using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;

namespace Cap7CE.Core.Host.MetadataExtraction;

public sealed record FileFactOwnedStorageRoot(string Path, CatalogEntryIdentity Identity);

// Internal product-owned paths only, never user-supplied basename exclusions.
// Resolve both the physical directory and the Catalog identity before excluding
// a subtree. Replaced roots require a fresh resolution rather than stale reuse.
public static class FileFactOwnedStorage
{
    public static async Task<IReadOnlyList<FileFactOwnedStorageRoot>> ResolveAsync(CatalogV2Database catalog,
        IReadOnlyList<string> paths, CancellationToken token = default)
    {
        ArgumentNullException.ThrowIfNull(paths);
        if (paths.Count > 32 || paths.Any(path => string.IsNullOrWhiteSpace(path))) throw new ArgumentException("Invalid owned storage roots.");
        var volumes = (await catalog.ReadVolumesAsync(token)).ToDictionary(volume => volume.VolumeId, StringComparer.Ordinal);
        var roots = new List<FileFactOwnedStorageRoot>();
        foreach (var path in paths.Distinct(StringComparer.OrdinalIgnoreCase)) {
            token.ThrowIfCancellationRequested();
            var identity = NativeFileFactSourceGuard.CaptureDirectory(path)
                ?? throw new InvalidOperationException("owned-storage-identity-unavailable");
            if (!volumes.TryGetValue(identity.VolumeId, out var volume) || !volume.Selected) continue;
            if (volume.State != CatalogV2VolumeState.Ready) throw new InvalidOperationException("owned-storage-catalog-not-ready");
            var resolved = await catalog.ResolveDirectoryAsync(identity.VolumeId, path[3..], token);
            if (resolved?.Identity != identity) throw new InvalidOperationException("owned-storage-catalog-identity-mismatch");
            roots.Add(new(path, identity));
        }
        return roots;
    }

    public static FileFactQueuePolicy Exclude(FileFactQueuePolicy policy, IReadOnlyList<FileFactOwnedStorageRoot> roots)
    {
        FileFactQueue.ValidatePolicy(policy);
        Validate(roots);
        var effective = policy with { VolumeOrder = policy.VolumeOrder.ToArray(), Includes = policy.Includes.ToArray(),
            Excludes = policy.Excludes.Concat(roots.Where(root => policy.VolumeOrder.Contains(root.Identity.VolumeId, StringComparer.Ordinal))
                .Select(root => new FileFactScope(root.Identity.VolumeId, root.Identity.FileReference))).Distinct().ToArray() };
        FileFactQueue.ValidatePolicy(effective); return effective;
    }

    public static void Validate(IReadOnlyList<FileFactOwnedStorageRoot> roots)
    {
        ArgumentNullException.ThrowIfNull(roots);
        if (roots.Count > 32) throw new ArgumentException("Too many owned storage roots.");
        foreach (var root in roots) {
            if (root is null || NativeFileFactSourceGuard.CaptureDirectory(root.Path) != root.Identity)
                throw new InvalidOperationException("owned-storage-root-rebound");
        }
    }
}
