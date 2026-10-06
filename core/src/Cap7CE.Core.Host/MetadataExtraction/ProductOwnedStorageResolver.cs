using Cap7CE.Core.Catalog;

namespace Cap7CE.Core.Host.MetadataExtraction;

// These are fixed application-owned roots, never an arbitrary Catalog parent
// or a user-chosen asset folder. Unready/unselected volumes need no exclusion
// until they become eligible; a ready root still requires both identity checks.
internal static class ProductOwnedStorageResolver
{
    public static async Task<IReadOnlyList<FileFactOwnedStorageRoot>> ResolveAsync(CatalogV2Database catalog, CancellationToken token)
        => await ResolveAsync(catalog, await catalog.ReadVolumesAsync(token), token);

    public static async Task<IReadOnlyList<FileFactOwnedStorageRoot>> ResolveAsync(CatalogV2Database catalog,
        IReadOnlyList<CatalogV2VolumeSnapshot> ready, CancellationToken token)
    {
        var volumes = ready.Where(volume => volume.Selected && volume.State == CatalogV2VolumeState.Ready)
            .Select(volume => volume.VolumeId).ToHashSet(StringComparer.Ordinal);
        string[] paths = [Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Cap7CE"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Cap7CE")];
        var eligible = new List<string>();
        foreach (var path in paths) {
            token.ThrowIfCancellationRequested();
            var identity = NativeFileFactSourceGuard.CaptureDirectory(path)
                ?? throw new InvalidOperationException("owned-storage-identity-unavailable");
            if (volumes.Contains(identity.VolumeId)) eligible.Add(path);
        }
        return await FileFactOwnedStorage.ResolveAsync(catalog, eligible, token);
    }
}
