using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Host.MetadataRecovery;

// Writes only a new recovery database in the supplied private recovery directory.
// No restore, source mutation or activation occurs here.
public sealed class FileFactRecoveryCheckpoint(string databasePath, string recoveryDirectory)
{
    public async Task<string?> CreateBeforeActivationAsync(CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var sourcePath = Path.GetFullPath(databasePath);
        var recoveryRoot = Path.GetFullPath(recoveryDirectory);
        await using var source = new SqliteConnection(new SqliteConnectionStringBuilder {
            DataSource = sourcePath, Mode = SqliteOpenMode.ReadOnly, Pooling = false }.ToString());
        await source.OpenAsync(token);
        // Pin the WAL read snapshot so normal Catalog updates do not restart each backup batch.
        using var snapshot = source.BeginTransaction(deferred: true);
        using var schema = source.CreateCommand();
        schema.Transaction = snapshot;
        schema.CommandText = "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'file_fact_state');";
        // A previously activated database must not produce another full backup on every launch.
        if (Convert.ToInt32(await schema.ExecuteScalarAsync(token)) != 0) return null;
        schema.CommandText = "PRAGMA user_version;";
        var version = Convert.ToInt32(await schema.ExecuteScalarAsync(token));
        if (version is not (2 or 3))
            throw new InvalidDataException("metadata-recovery-catalog-version");
        if (version == 3) await new Cap7CE.Core.Catalog.DirectoryEntries.CatalogFileEntryActivation(new(sourcePath)).ReadEnabledAsync(token);
        return await CatalogRecoverySnapshotWriter.WriteAsync(source, recoveryRoot, "before-file-facts", token);
    }
}
