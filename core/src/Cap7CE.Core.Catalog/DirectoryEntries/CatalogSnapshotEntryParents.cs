using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.DirectoryEntries;

// MFT enumeration and name reads share a journal boundary, not a frozen volume.
// An unobserved parent defers the whole physical identity, never only one alias.
internal static class CatalogSnapshotEntryParents
{
    public static async Task DeferAsync(SqliteConnection connection, SqliteTransaction transaction, string volume, CancellationToken token)
    {
        var after = "";
        while (true) {
            token.ThrowIfCancellationRequested();
            using var command = connection.CreateCommand(); command.Transaction = transaction;
            command.Parameters.AddWithValue("$volume", volume); command.Parameters.AddWithValue("$after", after);
            command.CommandText = """
                SELECT n.file_reference,n.parent_file_reference,n.name,n.extension,n.attributes,
                    n.size_bytes,n.created_utc_ticks,n.modified_utc_ticks
                FROM build_nodes n WHERE n.volume_id=$volume AND n.file_reference>$after AND n.is_directory=0 AND n.exists_flag=1
                  AND EXISTS(SELECT 1 FROM build_entries e WHERE e.volume_id=n.volume_id AND e.file_reference=n.file_reference
                    AND NOT EXISTS(SELECT 1 FROM build_nodes p WHERE p.volume_id=e.volume_id AND p.file_reference=e.parent_file_reference
                        AND p.exists_flag=1 AND p.is_directory=1))
                ORDER BY n.file_reference LIMIT 64;
                """;
            var page = new List<CatalogFileEntryDeferred>();
            using (var reader = await command.ExecuteReaderAsync(token)) {
                while (await reader.ReadAsync(token)) page.Add(new(new(new(volume, reader.GetString(0)),
                    reader.IsDBNull(1) ? null : reader.GetString(1), reader.GetString(2), reader.GetString(3), false, reader.GetInt64(4), true,
                    Number(reader, 5), Number(reader, 6), Number(reader, 7)), 0));
            }
            if (page.Count == 0) return;
            await CatalogFileEntryPendingStaging.AppendAsync(connection, transaction, volume, page, token);
            command.Parameters.RemoveAt("$after"); var reference = command.Parameters.Add("$reference", SqliteType.Text);
            command.CommandText = "DELETE FROM build_entries WHERE volume_id=$volume AND file_reference=$reference; DELETE FROM build_entry_sets WHERE volume_id=$volume AND file_reference=$reference;";
            foreach (var item in page) {
                token.ThrowIfCancellationRequested(); reference.Value = item.Node.Identity.FileReference;
                await command.ExecuteNonQueryAsync(token);
            }
            after = page[^1].Node.Identity.FileReference;
        }
    }
    private static long? Number(SqliteDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? null : reader.GetInt64(ordinal);
}
