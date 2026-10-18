using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.DirectoryEntries;

internal static class CatalogFileEntryStaging
{
    public static async Task CreateAsync(SqliteConnection connection, CancellationToken token)
    {
        using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE build_entry_sets(volume_id TEXT NOT NULL,file_reference TEXT NOT NULL,created INTEGER,modified INTEGER,size INTEGER,
                PRIMARY KEY(volume_id,file_reference)) STRICT, WITHOUT ROWID;
            CREATE TABLE build_entries(volume_id TEXT NOT NULL,file_reference TEXT NOT NULL,entry_key TEXT NOT NULL,
                parent_file_reference TEXT NOT NULL,name TEXT NOT NULL,extension TEXT NOT NULL,
                PRIMARY KEY(volume_id,file_reference,entry_key)) STRICT, WITHOUT ROWID;
            """;
        await command.ExecuteNonQueryAsync(token);
        await CatalogFileEntryPendingStaging.CreateAsync(connection, token);
    }

    public static async Task AppendAsync(SqliteConnection connection, SqliteTransaction transaction, string volume,
        IReadOnlyList<CatalogV2NodeRecord> nodes, IReadOnlyList<CatalogFileEntryUpdate> updates, CancellationToken token)
    {
        var entries = CatalogFileEntryPublication.Validate(volume, nodes, updates);
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        for (var i = 0; i < updates.Count; i++) {
            var update = updates[i]; command.Parameters.Clear();
            command.Parameters.AddWithValue("$volume", volume); command.Parameters.AddWithValue("$ref", update.Identity.FileReference);
            command.Parameters.AddWithValue("$created", (object?)update.Source.CreatedUtcTicks ?? DBNull.Value);
            command.Parameters.AddWithValue("$modified", (object?)update.Source.ModifiedUtcTicks ?? DBNull.Value);
            command.Parameters.AddWithValue("$size", (object?)update.Source.SizeBytes ?? DBNull.Value);
            command.CommandText = "DELETE FROM build_entries WHERE volume_id=$volume AND file_reference=$ref; INSERT OR REPLACE INTO build_entry_sets VALUES($volume,$ref,$created,$modified,$size);";
            await command.ExecuteNonQueryAsync(token);
            foreach (var entry in entries[i]) {
                command.Parameters.AddWithValue("$key", entry.EntryKey); command.Parameters.AddWithValue("$parent", entry.ParentFileReference);
                command.Parameters.AddWithValue("$name", entry.Name); command.Parameters.AddWithValue("$extension", entry.Extension);
                command.CommandText = "INSERT INTO build_entries VALUES($volume,$ref,$key,$parent,$name,$extension);";
                await command.ExecuteNonQueryAsync(token);
                foreach (var key in new[] { "$key", "$parent", "$name", "$extension" }) command.Parameters.RemoveAt(key);
            }
        }
    }

    public static async Task PublishAsync(SqliteConnection connection, SqliteTransaction transaction, string volume, CancellationToken token)
    {
        if (!await CatalogFileEntrySchema.ExistsAsync(connection, token, transaction))
            throw new InvalidOperationException("File entries were not activated.");
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.Parameters.AddWithValue("$volume", volume);
        command.CommandText = """
            SELECT EXISTS(SELECT 1 FROM snapshot_build.build_entry_sets s LEFT JOIN catalog_nodes_v2 n
                ON n.volume_id=s.volume_id AND n.file_reference=s.file_reference
                WHERE s.volume_id=$volume AND (n.file_reference IS NULL OR n.exists_flag=0 OR n.is_directory=1
                    OR n.created_utc_ticks IS NOT s.created OR n.modified_utc_ticks IS NOT s.modified OR n.size_bytes IS NOT s.size))
            OR EXISTS(SELECT 1 FROM snapshot_build.build_entries e LEFT JOIN catalog_nodes_v2 p
                ON p.volume_id=e.volume_id AND p.file_reference=e.parent_file_reference
                WHERE e.volume_id=$volume AND (p.file_reference IS NULL OR p.exists_flag=0 OR p.is_directory=0));
            """;
        if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) != 0) throw new CatalogConcurrencyException("Snapshot entry source or parent changed.");
        command.CommandText = """
            DELETE FROM catalog_file_entry_sets WHERE volume_id=$volume AND
                (file_reference IN (SELECT file_reference FROM snapshot_build.build_entry_sets WHERE volume_id=$volume)
                 OR file_reference IN (SELECT file_reference FROM catalog_nodes_v2 WHERE volume_id=$volume AND exists_flag=0));
            INSERT INTO catalog_file_entry_sets SELECT volume_id,file_reference,created FROM snapshot_build.build_entry_sets WHERE volume_id=$volume;
            INSERT INTO catalog_file_entries SELECT volume_id,file_reference,entry_key,parent_file_reference,name,extension
                FROM snapshot_build.build_entries WHERE volume_id=$volume;
            """;
        await command.ExecuteNonQueryAsync(token);
        await CatalogFileEntryPendingStaging.PublishAsync(connection, transaction, volume, token);
    }
}
