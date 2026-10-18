using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.DirectoryEntries;

internal static class CatalogFileEntryActivationMarker
{
    public static async Task CreateAsync(SqliteConnection connection, SqliteTransaction transaction, long revision, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.Parameters.AddWithValue("$revision", revision);
        command.CommandText = """
            CREATE TABLE catalog_file_entry_activation (
                singleton INTEGER PRIMARY KEY CHECK(singleton=1),feature_version INTEGER NOT NULL CHECK(feature_version>=1),
                activated_revision INTEGER NOT NULL CHECK(activated_revision>=0)
            ) STRICT;
            INSERT INTO catalog_file_entry_activation VALUES(1,1,$revision);
            PRAGMA user_version=3;
            """;
        await command.ExecuteNonQueryAsync(token);
    }
}
