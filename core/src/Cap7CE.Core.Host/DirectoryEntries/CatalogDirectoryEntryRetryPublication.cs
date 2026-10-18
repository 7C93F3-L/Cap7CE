using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;

namespace Cap7CE.Core.Host;

// If one name has an unresolved parent, independent files still make progress.
// A concurrent writer instead retires this observation; no stale retry is forced.
internal static class CatalogDirectoryEntryRetryPublication
{
    public static async Task<CatalogV2VolumeSnapshot?> ApplyAsync(CatalogV2Database catalog, CatalogV2WriteBatch batch,
        IReadOnlyList<CatalogFileEntryDeferred> original, CancellationToken token)
    {
        try { return await catalog.ApplyEntryRetryBatchAsync(batch, token); }
        catch (CatalogConcurrencyException) {
            if (await catalog.ReadRevisionAsync(token) != batch.ExpectedCatalogRevision) return null;
        }
        CatalogV2VolumeSnapshot? last = null; var revision = batch.ExpectedCatalogRevision;
        foreach (var item in original) {
            var identity = item.Node.Identity;
            var single = batch with { ExpectedCatalogRevision = revision,
                Nodes = batch.Nodes.Where(node => node.Identity == identity).ToArray(),
                FileEntries = batch.FileEntries!.Where(entry => entry.Identity == identity).ToArray(),
                DeferredEntries = batch.DeferredEntries?.Where(entry => entry.Node.Identity == identity).ToArray() };
            try { last = await catalog.ApplyEntryRetryBatchAsync(single, token); }
            catch (CatalogConcurrencyException) {
                if (await catalog.ReadRevisionAsync(token) != revision) return last;
                last = await catalog.ApplyEntryRetryBatchAsync(single with { Nodes = [], FileEntries = [], DeferredEntries = [item] }, token);
            }
            revision = last.CatalogRevision;
        }
        return last;
    }
}
