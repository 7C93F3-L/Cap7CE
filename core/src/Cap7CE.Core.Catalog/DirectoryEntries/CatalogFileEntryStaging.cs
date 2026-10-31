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
        SqliteCommand Prepare(string sql,params string[] keys) {
            var command=connection.CreateCommand();command.Transaction=transaction;command.CommandText=sql;
            foreach(var key in keys)command.Parameters.Add(key,key is "$created" or "$modified" or "$size"?SqliteType.Integer:SqliteType.Text);
            command.Parameters["$volume"].Value=volume;command.Prepare();return command;
        }
        using var remove=Prepare("DELETE FROM build_entries WHERE volume_id=$volume AND file_reference=$ref;","$volume","$ref");
        using var sets=Prepare("INSERT OR REPLACE INTO build_entry_sets VALUES($volume,$ref,$created,$modified,$size);","$volume","$ref","$created","$modified","$size");
        using var names=Prepare("INSERT INTO build_entries VALUES($volume,$ref,$key,$parent,$name,$extension);","$volume","$ref","$key","$parent","$name","$extension");
        for(var i=0;i<updates.Count;i++) {
            var update=updates[i];remove.Parameters["$ref"].Value=sets.Parameters["$ref"].Value=names.Parameters["$ref"].Value=update.Identity.FileReference;
            sets.Parameters["$created"].Value=(object?)update.Source.CreatedUtcTicks??DBNull.Value;
            sets.Parameters["$modified"].Value=(object?)update.Source.ModifiedUtcTicks??DBNull.Value;
            sets.Parameters["$size"].Value=(object?)update.Source.SizeBytes??DBNull.Value;
            await remove.ExecuteNonQueryAsync(token);await sets.ExecuteNonQueryAsync(token);
            foreach(var entry in entries[i]) {
                names.Parameters["$key"].Value=entry.EntryKey;names.Parameters["$parent"].Value=entry.ParentFileReference;
                names.Parameters["$name"].Value=entry.Name;names.Parameters["$extension"].Value=entry.Extension;
                await names.ExecuteNonQueryAsync(token);
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
            DELETE FROM catalog_file_entry_sets AS old WHERE volume_id=$volume AND
                (file_reference IN (SELECT file_reference FROM catalog_nodes_v2 WHERE volume_id=$volume AND exists_flag=0)
                 OR EXISTS(SELECT 1 FROM snapshot_build.build_entry_sets s WHERE s.volume_id=old.volume_id AND s.file_reference=old.file_reference AND
                    (s.created IS NOT old.created_utc_ticks
                     OR EXISTS(SELECT entry_key,parent_file_reference,name,extension FROM snapshot_build.build_entries WHERE volume_id=old.volume_id AND file_reference=old.file_reference EXCEPT SELECT entry_key,parent_file_reference,name,extension FROM catalog_file_entries WHERE volume_id=old.volume_id AND file_reference=old.file_reference)
                     OR EXISTS(SELECT entry_key,parent_file_reference,name,extension FROM catalog_file_entries WHERE volume_id=old.volume_id AND file_reference=old.file_reference EXCEPT SELECT entry_key,parent_file_reference,name,extension FROM snapshot_build.build_entries WHERE volume_id=old.volume_id AND file_reference=old.file_reference))));
            INSERT INTO catalog_file_entry_sets SELECT volume_id,file_reference,created FROM snapshot_build.build_entry_sets WHERE volume_id=$volume ON CONFLICT DO NOTHING;
            INSERT INTO catalog_file_entries SELECT volume_id,file_reference,entry_key,parent_file_reference,name,extension
                FROM snapshot_build.build_entries WHERE volume_id=$volume ON CONFLICT DO NOTHING;
            """;
        await command.ExecuteNonQueryAsync(token);
        await CatalogFileEntryPendingStaging.PublishAsync(connection, transaction, volume, token);
    }
}
