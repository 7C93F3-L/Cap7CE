using Cap7CE.Core.Catalog;
using Cap7CE.Core.Host.MetadataExtraction;

namespace Cap7CE.Core.Host.CatalogMaintenance;

internal static class CatalogMaintenanceActivation
{
    public static Task StartAsync(CatalogReaderOwnership ownership, CatalogV2Database catalog,
        ICatalogReaderSessionFactory factory, CatalogChangeSignal signal,
        Func<IReadOnlyList<CatalogV2VolumeSnapshot>, CancellationToken, Task<IReadOnlyList<FileFactOwnedStorageRoot>>> resolveRoots,
        CancellationToken token, CatalogPreparationDiagnostics? diagnostics = null)
    {
        var monitor = new CatalogJournalMonitor(catalog, factory, resolveRoots, signal.PublishCatalog,
            listening: () => signal.SetState("watching"), diagnostics: diagnostics);
        return ownership.ActivateAsync(async lifetime => {
            signal.SetState("starting");
            try { await monitor.RunAsync(lifetime); signal.SetState("idle"); }
            catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { signal.SetState("paused"); throw; }
            catch (NotSupportedException) { signal.SetState("unavailable", "reader-wait-unavailable"); throw; }
            catch (InvalidOperationException) { signal.SetState("failed", "owned-storage-unavailable"); throw; }
            catch (Exception error) when (error is not OutOfMemoryException) { signal.SetState("failed", "reader-monitor-failed"); throw; }
        }, token);
    }
}
