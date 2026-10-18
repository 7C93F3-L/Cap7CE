using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.DirectoryEntries;

internal static class CatalogFileEntryPendingStaging
{
    public static async Task CreateAsync(SqliteConnection connection, CancellationToken token)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "CREATE TABLE build_entry_pending(volume_id TEXT NOT NULL,file_reference TEXT NOT NULL,event_json TEXT NOT NULL,PRIMARY KEY(volume_id,file_reference)) STRICT, WITHOUT ROWID;";
        await command.ExecuteNonQueryAsync(token);
    }
    public static async Task AppendAsync(SqliteConnection connection, SqliteTransaction transaction, string volume,
        IReadOnlyList<CatalogFileEntryDeferred>? items, CancellationToken token)
    {
        if (items is null) return;
        if (items.Count > CatalogV2Contract.MaximumBatchNodes) throw new ArgumentException("Pending snapshot page exceeds its bound.");
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.CommandText = "INSERT OR REPLACE INTO build_entry_pending VALUES($volume,$reference,$json);";
        command.Parameters.AddWithValue("$volume", volume); var reference = command.Parameters.Add("$reference", SqliteType.Text); var json = command.Parameters.Add("$json", SqliteType.Text);
        foreach (var item in items) {
            CatalogFileEntryPending.Validate(item, volume); reference.Value = item.Node.Identity.FileReference; json.Value = JsonSerializer.Serialize(item);
            await command.ExecuteNonQueryAsync(token);
        }
    }
    public static async Task PublishAsync(SqliteConnection connection, SqliteTransaction transaction, string volume, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction; command.Parameters.AddWithValue("$volume", volume);
        command.CommandText = """
            DELETE FROM catalog_file_entry_pending WHERE volume_id=$volume;
            INSERT INTO catalog_file_entry_pending SELECT volume_id,file_reference,event_json,0,0 FROM snapshot_build.build_entry_pending WHERE volume_id=$volume
                ON CONFLICT(volume_id,file_reference) DO UPDATE SET event_json=excluded.event_json,attempts=0,next_retry=0;
            SELECT COUNT(*) FROM catalog_file_entry_pending WHERE volume_id=$volume;
            """;
        if (Convert.ToInt64(await command.ExecuteScalarAsync(token)) > 65_536) throw new InvalidOperationException("Pending entry capacity exceeded.");
    }
}
