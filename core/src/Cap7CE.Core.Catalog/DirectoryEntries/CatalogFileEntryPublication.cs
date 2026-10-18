using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.DirectoryEntries;

// Called inside the existing node/checkpoint transaction, never a second commit.
internal static class CatalogFileEntryPublication
{
    internal static CatalogFileEntry[][] Validate(string volume, IReadOnlyList<CatalogV2NodeRecord> nodes,
        IReadOnlyList<CatalogFileEntryUpdate> updates)
    {
        if (updates.Count > nodes.Count || updates.Select(update => update.Identity).Distinct().Count() != updates.Count)
            throw new ArgumentException("Invalid entry publication count or identity.");
        var latest = nodes.GroupBy(node => node.Identity).ToDictionary(group => group.Key, group => group.Last());
        var entries = new List<CatalogFileEntry[]>(); var count = 0;
        foreach (var update in updates) {
            if (update.Identity.VolumeId != volume || !latest.TryGetValue(update.Identity, out var node)
                || node.IsDirectory || !node.Exists || update.Source != new CatalogFileEntrySource(node.CreatedUtcTicks, node.ModifiedUtcTicks, node.SizeBytes))
                throw new ArgumentException("Entry source does not match its physical publication.");
            var normalized = CatalogFileEntryRules.Normalize(update.Identity, update.Names);
            count = checked(count + normalized.Length);
            if (count > 65_536) throw new ArgumentException("Entry publication exceeds its page budget.");
            entries.Add(normalized);
        }
        return entries.ToArray();
    }

    public static async Task ApplyAsync(SqliteConnection connection, SqliteTransaction transaction,
        CatalogV2WriteBatch batch, CancellationToken token)
    {
        if (batch.FileEntries is not { } updates) return;
        var entries = Validate(batch.VolumeId, batch.Nodes, updates);
        if (!await CatalogFileEntrySchema.ExistsAsync(connection, token, transaction))
            throw new InvalidOperationException("File entries were not activated.");
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.Parameters.AddWithValue("$volume", batch.VolumeId);
        command.CommandText = "DELETE FROM catalog_file_entry_sets WHERE volume_id=$volume AND file_reference=$reference;";
        var deadReference = command.Parameters.Add("$reference", SqliteType.Text);
        foreach (var identity in batch.Nodes.Where(node => !node.Exists).Select(node => node.Identity).Distinct()) {
            deadReference.Value = identity.FileReference; await command.ExecuteNonQueryAsync(token);
        }
        for (var i = 0; i < updates.Count; i++) {
            var update = updates[i];
            command.Parameters.Clear(); command.Parameters.AddWithValue("$volume", batch.VolumeId);
            command.Parameters.AddWithValue("$reference", update.Identity.FileReference);
            command.Parameters.AddWithValue("$created", (object?)update.Source.CreatedUtcTicks ?? DBNull.Value);
            command.CommandText = "DELETE FROM catalog_file_entry_sets WHERE volume_id=$volume AND file_reference=$reference; INSERT INTO catalog_file_entry_sets VALUES($volume,$reference,$created);";
            await command.ExecuteNonQueryAsync(token);
            foreach (var entry in entries[i]) {
                command.Parameters.AddWithValue("$parent", entry.ParentFileReference);
                command.CommandText = "SELECT EXISTS(SELECT 1 FROM catalog_nodes_v2 WHERE volume_id=$volume AND file_reference=$parent AND exists_flag=1 AND is_directory=1);";
                if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) != 1) throw new CatalogConcurrencyException("Entry parent is unavailable.");
                command.Parameters.AddWithValue("$key", entry.EntryKey); command.Parameters.AddWithValue("$name", entry.Name);
                command.Parameters.AddWithValue("$extension", entry.Extension);
                command.CommandText = "INSERT INTO catalog_file_entries VALUES($volume,$reference,$key,$parent,$name,$extension);";
                await command.ExecuteNonQueryAsync(token);
                foreach (var key in new[] { "$parent", "$key", "$name", "$extension" }) command.Parameters.RemoveAt(key);
            }
        }
    }
}
