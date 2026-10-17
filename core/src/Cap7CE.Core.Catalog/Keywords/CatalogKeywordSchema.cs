using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.Keywords;

internal static class CatalogKeywordSchema
{
    internal static async Task InitializeAsync(SqliteConnection connection, CancellationToken token)
    {
        using var command = connection.CreateCommand();
        // User annotations deliberately have no cascading foreign key to replaceable Catalog nodes.
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS catalog_manual_keywords (
                volume_id TEXT NOT NULL,
                file_reference TEXT NOT NULL,
                created_file_time TEXT NOT NULL,
                keywords_json TEXT NOT NULL,
                search_text TEXT NOT NULL CHECK(length(search_text) <= 32768),
                revision INTEGER NOT NULL CHECK(revision >= 0),
                PRIMARY KEY(volume_id, file_reference, created_file_time)
            ) STRICT, WITHOUT ROWID;
            """;
        await command.ExecuteNonQueryAsync(token);
    }

    internal static string Match(string parameter) => $"""
        EXISTS(SELECT 1 FROM catalog_manual_keywords mk
        WHERE mk.volume_id = n.volume_id AND mk.file_reference = n.file_reference
          AND mk.created_file_time = COALESCE(CAST(n.created_utc_ticks AS TEXT), '')
          AND mk.search_text LIKE {parameter} ESCAPE '\' COLLATE NOCASE)
        """;
}
