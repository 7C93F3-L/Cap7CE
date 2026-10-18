using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.DirectoryEntries;

internal static class CatalogFileEntrySchema
{
    public static async Task InitializeAsync(SqliteConnection connection, CancellationToken token)
    {
        await CatalogV2Schema.ValidateAsync(connection, token);
        using var transaction = connection.BeginTransaction();
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS catalog_file_entry_sets (
                volume_id TEXT NOT NULL, file_reference TEXT NOT NULL,
                created_utc_ticks INTEGER NULL CHECK(created_utc_ticks IS NULL OR created_utc_ticks >= 0),
                PRIMARY KEY(volume_id, file_reference),
                FOREIGN KEY(volume_id, file_reference) REFERENCES catalog_nodes_v2(volume_id, file_reference) ON DELETE CASCADE
            ) STRICT, WITHOUT ROWID;
            CREATE TABLE IF NOT EXISTS catalog_file_entries (
                volume_id TEXT NOT NULL, file_reference TEXT NOT NULL,
                entry_key TEXT NOT NULL CHECK(length(entry_key)=64),
                parent_file_reference TEXT NOT NULL CHECK(length(parent_file_reference)=16),
                name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 1024),
                extension TEXT NOT NULL CHECK(length(extension)<=64),
                PRIMARY KEY(volume_id, file_reference, entry_key),
                UNIQUE(volume_id, file_reference, parent_file_reference, name),
                FOREIGN KEY(volume_id, file_reference) REFERENCES catalog_file_entry_sets(volume_id, file_reference) ON DELETE CASCADE
            ) STRICT, WITHOUT ROWID;
            CREATE INDEX IF NOT EXISTS catalog_file_entries_parent ON catalog_file_entries(volume_id, parent_file_reference, name COLLATE NOCASE, file_reference, entry_key);
            """;
        await command.ExecuteNonQueryAsync(token);
        transaction.Commit();
    }

    public static async Task<bool> ExistsAsync(SqliteConnection connection, CancellationToken token, SqliteTransaction? transaction = null)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('catalog_file_entry_sets','catalog_file_entries');";
        var count = Convert.ToInt32(await command.ExecuteScalarAsync(token));
        if (count == 1) throw new CatalogSchemaException("File entry schema is incomplete.");
        return count == 2;
    }
}
