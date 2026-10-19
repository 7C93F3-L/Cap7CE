using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.DirectoryEntries;

// A journal page can observe file names before their parent directories arrive.
// Preserve the complete old identity and retry it through the existing queue.
internal static class CatalogJournalEntryParents
{
    public static async Task<CatalogV2WriteBatch> DeferAsync(SqliteConnection connection,
        SqliteTransaction transaction, CatalogV2WriteBatch batch, CancellationToken token)
    {
        if (batch.FileEntries is not { Count: > 0 } updates) return batch;
        var entries = CatalogFileEntryPublication.Validate(batch.VolumeId, batch.Nodes, updates);
        var versions = batch.Nodes.GroupBy(node => node.Identity).ToDictionary(group => group.Key, group => group.ToArray());
        var latest = versions.ToDictionary(pair => pair.Key, pair => pair.Value[^1]);
        var blocked = new HashSet<CatalogEntryIdentity>();
        var parents = new Dictionary<string, bool>(StringComparer.Ordinal);
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.CommandText = "SELECT EXISTS(SELECT 1 FROM catalog_nodes_v2 WHERE volume_id=$volume AND file_reference=$parent AND exists_flag=1 AND is_directory=1);";
        command.Parameters.AddWithValue("$volume", batch.VolumeId);
        var parent = command.Parameters.Add("$parent", SqliteType.Text);
        for (var index = 0; index < updates.Count; index++) {
            foreach (var entry in entries[index]) {
                token.ThrowIfCancellationRequested();
                if (!parents.TryGetValue(entry.ParentFileReference, out var available)) {
                    if (latest.TryGetValue(new(batch.VolumeId, entry.ParentFileReference), out var node))
                        available = node.Exists && node.IsDirectory;
                    else {
                        parent.Value = entry.ParentFileReference;
                        available = Convert.ToInt32(await command.ExecuteScalarAsync(token)) == 1;
                    }
                    parents.Add(entry.ParentFileReference, available);
                }
                if (!available) { blocked.Add(updates[index].Identity); break; }
            }
        }
        if (blocked.Count == 0) return batch;
        var deferred = (batch.DeferredEntries ?? []).ToList();
        foreach (var identity in blocked) {
            var node = latest[identity];
            // Pending replays use reason bits to retain both invalidation flags.
            var reason = (versions[identity].Any(item => item.InvalidatesFileFacts) ? 0x1u : 0u)
                | (versions[identity].Any(item => item.MayChangeFileFormat) ? 0x1000u : 0u);
            deferred.Add(new(node, reason));
        }
        return batch with {
            Nodes = batch.Nodes.Where(node => !blocked.Contains(node.Identity)).ToArray(),
            FileEntries = updates.Where(update => !blocked.Contains(update.Identity)).ToArray(),
            DeferredEntries = deferred
        };
    }
}
