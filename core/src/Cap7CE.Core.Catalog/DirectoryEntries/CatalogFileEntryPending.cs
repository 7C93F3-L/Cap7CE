using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.DirectoryEntries;

// Unknown metadata is durable work, never a guessed deletion. No source IO or timers.
public sealed class CatalogFileEntryPending(CatalogV2Database catalog)
{
    internal const string CreateTableSql = """
        CREATE TABLE IF NOT EXISTS catalog_file_entry_pending (
            volume_id TEXT NOT NULL,file_reference TEXT NOT NULL,event_json TEXT NOT NULL,
            attempts INTEGER NOT NULL CHECK(attempts BETWEEN 0 AND 8),next_retry INTEGER NOT NULL CHECK(next_retry>=0),
            PRIMARY KEY(volume_id,file_reference),FOREIGN KEY(volume_id) REFERENCES catalog_volumes_v2(volume_id) ON DELETE CASCADE
        ) STRICT, WITHOUT ROWID;
        CREATE INDEX IF NOT EXISTS catalog_file_entry_pending_due ON catalog_file_entry_pending(volume_id,attempts,next_retry);
        """;
    internal static async Task<bool> ExistsAsync(SqliteConnection connection, SqliteTransaction? transaction, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.CommandText = "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='catalog_file_entry_pending');";
        return Convert.ToInt32(await command.ExecuteScalarAsync(token)) != 0;
    }
    internal static async Task<string> ExclusionSqlAsync(SqliteConnection connection, SqliteTransaction? transaction, CancellationToken token) =>
        await ExistsAsync(connection, transaction, token) ? "NOT EXISTS(SELECT 1 FROM catalog_file_entry_pending pending WHERE pending.volume_id=n.volume_id AND pending.file_reference=n.file_reference)" : "1";

    public async Task<CatalogFileEntryPendingPage> ReadDueAsync(string volume, long now, int limit = 64, CancellationToken token = default)
    {
        if (now < 0 || limit is < 1 or > 64) throw new ArgumentException("Invalid pending entry page.");
        await using var connection = await catalog.OpenAsync(true, token);
        if (!await ExistsAsync(connection, null, token)) return new([], long.MaxValue, 0, 0);
        using var transaction = connection.BeginTransaction(deferred: true);
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.Parameters.AddWithValue("$volume", volume); command.Parameters.AddWithValue("$now", now); command.Parameters.AddWithValue("$limit", limit);
        command.CommandText = "SELECT event_json,file_reference FROM catalog_file_entry_pending WHERE volume_id=$volume AND attempts<8 AND next_retry<=$now ORDER BY next_retry,file_reference LIMIT $limit;";
        var items = new List<CatalogFileEntryDeferred>();
        using (var reader = await command.ExecuteReaderAsync(token)) {
            while (await reader.ReadAsync(token)) {
                var item = Decode(reader.GetString(0)); Validate(item, volume);
                if (item.Node.Identity.FileReference != reader.GetString(1)) throw new CatalogSchemaException("Pending entry reference mismatch.");
                items.Add(item);
            }
        }
        command.CommandText = "SELECT COALESCE(MIN(CASE WHEN attempts<8 THEN next_retry END),9223372036854775807),COALESCE(SUM(attempts<8),0),COALESCE(SUM(attempts=8),0) FROM catalog_file_entry_pending WHERE volume_id=$volume;";
        using var summary = await command.ExecuteReaderAsync(token); await summary.ReadAsync(token);
        return new(items.AsReadOnly(), summary.GetInt64(0), summary.GetInt64(1), summary.GetInt64(2));
    }
    public async Task RearmAsync(string volume, CancellationToken token = default)
    {
        await using var connection = await catalog.OpenAsync(false, token);
        if (!await ExistsAsync(connection, null, token)) return;
        using var command = connection.CreateCommand(); command.Parameters.AddWithValue("$volume", volume);
        command.CommandText = "UPDATE catalog_file_entry_pending SET attempts=0,next_retry=0 WHERE volume_id=$volume AND attempts>0;";
        await command.ExecuteNonQueryAsync(token);
    }
    internal static CatalogFileEntryDeferred Decode(string json)
    {
        if (json.Length > 16384) throw new CatalogSchemaException("Pending entry event exceeds its bound.");
        try {
            var value = JsonSerializer.Deserialize<CatalogFileEntryDeferred>(json) ?? throw new ArgumentException();
            Validate(value, value.Node?.Identity?.VolumeId!); return value;
        } catch (Exception error) when (error is JsonException or ArgumentException or NullReferenceException) {
            throw new CatalogSchemaException("Invalid pending entry event.");
        }
    }
    internal static void Validate(CatalogFileEntryDeferred value, string volume)
    {
        if (value.Node is null || value.Node.Identity is null) throw new ArgumentException("Missing pending entry identity.");
        CatalogV2Database.ValidateIdentity(value.Node.Identity);
        if (value.Node.Identity.VolumeId != volume || value.Node.IsDirectory || value.Node.Name is null || value.Node.Name.Length > 1024)
            throw new ArgumentException("Invalid pending entry identity.");
    }
}
