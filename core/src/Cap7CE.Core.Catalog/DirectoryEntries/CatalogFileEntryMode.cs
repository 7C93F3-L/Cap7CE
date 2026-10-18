using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.DirectoryEntries;

internal static class CatalogFileEntryMode
{
    public const int StorageVersion = 3;
    public static async Task<bool> ReadAsync(SqliteConnection connection, SqliteTransaction? transaction, CancellationToken token)
    {
        using var command = connection.CreateCommand(); if (transaction is not null) command.Transaction = transaction;
        command.CommandText = "PRAGMA user_version;";
        return await ValidateAsync(connection, transaction, Convert.ToInt32(await command.ExecuteScalarAsync(token)), token);
    }
    public static async Task<bool> ValidateAsync(SqliteConnection connection, SqliteTransaction? transaction, int version, CancellationToken token)
    {
        if (version is not (CatalogV2Contract.SchemaVersion or StorageVersion)) throw new CatalogSchemaException("Catalog storage version is unsupported.");
        using var command = connection.CreateCommand(); if (transaction is not null) command.Transaction = transaction;
        command.CommandText = "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='catalog_file_entry_activation');";
        var marker = Convert.ToInt32(await command.ExecuteScalarAsync(token)) != 0;
        if (version == CatalogV2Contract.SchemaVersion) {
            if (marker) throw new CatalogSchemaException("Entry mode cannot be downgraded by editing its storage version.");
            return false;
        }
        command.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('catalog_file_entry_sets','catalog_file_entries','catalog_file_entry_pending','catalog_file_entry_job_hints','catalog_file_entry_activation');";
        if (!marker || Convert.ToInt32(await command.ExecuteScalarAsync(token)) != 5) throw new CatalogSchemaException("Entry storage is incomplete.");
        command.CommandText = "SELECT feature_version,activated_revision FROM catalog_file_entry_activation WHERE singleton=1;";
        using var row = await command.ExecuteReaderAsync(token);
        if (!await row.ReadAsync(token) || row.GetInt64(0) != 1 || row.GetInt64(1) < 0) throw new CatalogSchemaException("Entry storage feature version is unsupported.");
        return true;
    }
    public static async Task RequireWriterAsync(SqliteConnection connection, SqliteTransaction? transaction, bool entryAware, CancellationToken token)
    {
        if (await ReadAsync(connection, transaction, token) && !entryAware) throw new CatalogSchemaException("Entry-aware Catalog writer is required.");
    }
}
