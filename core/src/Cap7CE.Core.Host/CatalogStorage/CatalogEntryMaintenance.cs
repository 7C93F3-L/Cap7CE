using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Cap7CE.Core.Host.MetadataRecovery;

namespace Cap7CE.Core.Host.CatalogStorage;

public sealed record CatalogEntryUpgradeResult(bool Activated, string? RecoveryPath, long Revision);
public sealed record CatalogEntryRollbackResult(string PreservedEntryCatalogPath);

// Explicit, offline, ordinary-user maintenance. Not called by ordinary startup,
// queries, Reader deployment or background synchronization.
public sealed class CatalogEntryMaintenance(string databasePath, string recoveryDirectory)
{
    public async Task<CatalogEntryUpgradeResult> UpgradeAsync(CancellationToken token = default)
    {
        token.ThrowIfCancellationRequested();
        var path = Path.GetFullPath(databasePath);
        using var owner = CatalogStorageLease.Acquire(path);
        await CatalogOfflineStorage.PrepareAsync(path, token);
        var catalog = new CatalogV2Database(path); var activation = new CatalogFileEntryActivation(catalog);
        if (await activation.ReadEnabledAsync(token)) return new(false, null, await catalog.ReadRevisionAsync(token));
        var checkpoint = await CatalogEntryRecoveryCheckpoint.CreateAsync(path, Path.GetFullPath(recoveryDirectory), "before-entries", false, token);
        // Revision CAS refuses any update made after the pinned recovery snapshot.
        var activated = await activation.EnablePreparedAsync(checkpoint.Revision, token);
        return new(activated, checkpoint.Path, await catalog.ReadRevisionAsync(token));
    }

    public async Task<CatalogEntryRollbackResult> RollbackAsync(string legacyRecoveryPath, CancellationToken token = default)
    {
        token.ThrowIfCancellationRequested();
        var path = Path.GetFullPath(databasePath);
        using var owner = CatalogStorageLease.Acquire(path);
        await CatalogOfflineStorage.PrepareAsync(path, token);
        var catalog = new CatalogV2Database(path);
        if (!await new CatalogFileEntryActivation(catalog).ReadEnabledAsync(token))
            throw new InvalidDataException("Rollback requires an active entry Catalog.");
        var revision = await catalog.ReadRevisionAsync(token);
        var recoveryPath = Path.GetFullPath(legacyRecoveryPath);
        CatalogStorageLease.RejectReparsePoint(recoveryPath);
        // The restored file is staged on the same volume as the current Catalog.
        var stage = await CatalogEntryRecoveryCheckpoint.CreateAsync(recoveryPath, Path.GetDirectoryName(path)!, "entry-restore", false, token);
        var consumed = false;
        try {
            if (await catalog.ReadRevisionAsync(token) != revision) throw new CatalogConcurrencyException("Catalog changed during rollback preparation.");
            await CatalogOfflineStorage.PrepareAsync(path, token);
            var archive = path + ".before-entry-rollback-" + Guid.NewGuid().ToString("N") + ".sqlite";
            if (File.Exists(archive)) throw new IOException("Rollback archive already exists.");
            token.ThrowIfCancellationRequested();
            File.Replace(stage.Path, path, archive, false);
            consumed = true;
            return new(archive);
        }
        finally { if (!consumed && File.Exists(stage.Path)) File.Delete(stage.Path); }
    }
}
