using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.DirectoryEntries;

internal static class CatalogFileEntryPendingPublication
{
    public static async Task<IReadOnlyList<CatalogV2NodeRecord>> MergeInvalidationsAsync(SqliteConnection connection,
        SqliteTransaction transaction, CatalogV2WriteBatch batch, CancellationToken token)
    {
        if (batch.FileEntries is null) return batch.Nodes;
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.CommandText = "SELECT event_json FROM catalog_file_entry_pending WHERE volume_id=$volume AND file_reference=$reference;";
        command.Parameters.AddWithValue("$volume", batch.VolumeId); var reference = command.Parameters.Add("$reference", SqliteType.Text);
        var nodes = new List<CatalogV2NodeRecord>(batch.Nodes.Count);
        foreach (var node in batch.Nodes) {
            reference.Value = node.Identity.FileReference;
            var reason = !node.IsDirectory && await command.ExecuteScalarAsync(token) is string json
                ? CatalogFileEntryPending.Decode(json).Reason & ~0x200u : 0;
            nodes.Add(node with { InvalidatesFileFacts = node.InvalidatesFileFacts || FileFacts.FileFactChangeReasons.Invalidates(reason),
                MayChangeFileFormat = node.MayChangeFileFormat || FileFacts.FileFactChangeReasons.MayChangeFormat(reason) });
        }
        return nodes.AsReadOnly();
    }
    public static async Task ApplyAsync(SqliteConnection connection, SqliteTransaction transaction, CatalogV2WriteBatch batch, CancellationToken token)
    {
        if (batch.FileEntries is null && batch.DeferredEntries is null) return;
        if (!await CatalogFileEntryPending.ExistsAsync(connection, transaction, token)) throw new InvalidOperationException("Pending entries were not activated.");
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.Parameters.AddWithValue("$volume", batch.VolumeId); var reference = command.Parameters.Add("$reference", SqliteType.Text);
        command.CommandText = "DELETE FROM catalog_file_entry_pending WHERE volume_id=$volume AND file_reference=$reference;";
        foreach (var node in batch.Nodes.Where(node => !node.IsDirectory)) {
            reference.Value = node.Identity.FileReference; await command.ExecuteNonQueryAsync(token);
        }
        var deferred = batch.DeferredEntries ?? [];
        if (deferred.Count > CatalogV2Contract.MaximumBatchNodes) throw new ArgumentException("Pending page exceeds its bound.");
        foreach (var item in deferred) {
            CatalogFileEntryPending.Validate(item, batch.VolumeId); reference.Value = item.Node.Identity.FileReference;
            command.CommandText = "SELECT event_json,attempts FROM catalog_file_entry_pending WHERE volume_id=$volume AND file_reference=$reference;";
            CatalogFileEntryDeferred? old = null; var attempts = 0;
            using (var reader = await command.ExecuteReaderAsync(token)) if (await reader.ReadAsync(token)) { old = CatalogFileEntryPending.Decode(reader.GetString(0)); attempts = reader.GetInt32(1); }
            var merged = item with { Reason = item.Reason | (old?.Reason ?? 0) };
            var next = 0L;
            if (batch.EntryRetryAtUnixMilliseconds is { } now) {
                if (old is null) throw new CatalogConcurrencyException("Pending entry was already resolved.");
                attempts = Math.Min(8, attempts + 1);
                next = attempts == 8 ? long.MaxValue : checked(now + Math.Min(30 * 60_000L, 1000L << (attempts * 2)));
            } else attempts = 0;
            command.Parameters.AddWithValue("$json", JsonSerializer.Serialize(merged)); command.Parameters.AddWithValue("$attempts", attempts); command.Parameters.AddWithValue("$next", next);
            command.CommandText = "INSERT INTO catalog_file_entry_pending VALUES($volume,$reference,$json,$attempts,$next) ON CONFLICT(volume_id,file_reference) DO UPDATE SET event_json=excluded.event_json,attempts=excluded.attempts,next_retry=excluded.next_retry;";
            await command.ExecuteNonQueryAsync(token);
            foreach (var key in new[] { "$json", "$attempts", "$next" }) command.Parameters.RemoveAt(key);
        }
        command.CommandText = "SELECT COUNT(*) FROM catalog_file_entry_pending WHERE volume_id=$volume;";
        if (Convert.ToInt64(await command.ExecuteScalarAsync(token)) > 65_536) throw new InvalidOperationException("Pending entry capacity exceeded.");
    }
}
