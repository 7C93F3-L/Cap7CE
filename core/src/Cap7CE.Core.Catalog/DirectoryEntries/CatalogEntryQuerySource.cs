using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.DirectoryEntries;

internal static class CatalogEntryQuerySource
{
    public static async Task<bool> IsActiveAsync(SqliteConnection connection, SqliteTransaction transaction, CancellationToken token)
    {
        if (!await CatalogFileEntrySchema.ExistsAsync(connection, token, transaction)) return false;
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.CommandText = """
            SELECT EXISTS(SELECT 1 FROM catalog_file_entry_sets s JOIN catalog_nodes_v2 n
            ON n.volume_id=s.volume_id AND n.file_reference=s.file_reference
            WHERE n.exists_flag=1 AND n.is_directory=0 AND n.created_utc_ticks IS s.created_utc_ticks);
            """;
        return Convert.ToInt32(await command.ExecuteScalarAsync(token)) != 0;
    }

    // An optional relational projection, never a second Catalog or filesystem scan.
    // Existing catalogs retain their original indexed query when there are no sets.
    public const string Cte = """
        query_entries AS NOT MATERIALIZED (
            SELECT n.*, '' AS entry_key FROM catalog_nodes_v2 n
            WHERE n.is_directory=1 OR NOT EXISTS(SELECT 1 FROM catalog_file_entry_sets s
                WHERE s.volume_id=n.volume_id AND s.file_reference=n.file_reference AND s.created_utc_ticks IS n.created_utc_ticks)
            UNION ALL
            SELECT n.volume_id,n.file_reference,e.parent_file_reference,e.name,e.extension,
                n.is_directory,n.attributes,n.exists_flag,n.size_bytes,n.created_utc_ticks,n.modified_utc_ticks,e.entry_key
            FROM catalog_file_entries e JOIN catalog_file_entry_sets s ON s.volume_id=e.volume_id AND s.file_reference=e.file_reference
            JOIN catalog_nodes_v2 n ON n.volume_id=s.volume_id AND n.file_reference=s.file_reference
            JOIN catalog_nodes_v2 p ON p.volume_id=e.volume_id AND p.file_reference=e.parent_file_reference AND p.is_directory=1 AND p.exists_flag=1
            JOIN catalog_directory_paths_v2 pp ON pp.volume_id=e.volume_id AND pp.file_reference=e.parent_file_reference
            WHERE n.is_directory=0 AND n.created_utc_ticks IS s.created_utc_ticks
        ),
        """;
}
