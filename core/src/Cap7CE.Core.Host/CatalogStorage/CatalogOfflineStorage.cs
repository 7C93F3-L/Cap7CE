using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Host.CatalogStorage;

// Explicit offline maintenance only. The caller must retire older processes,
// which predate the lifetime sidecar, and hold CatalogStorageLease throughout.
internal static class CatalogOfflineStorage
{
    public static async Task PrepareAsync(string path, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        CatalogStorageLease.RejectReparsePoint(path);
        // Maintenance runs in its own process; release its idle validation pools.
        // An active connection is not closed by ClearAllPools and fails preflight.
        SqliteConnection.ClearAllPools();
        using (File.Open(path, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) { }
        await using var connection = new SqliteConnection(new SqliteConnectionStringBuilder {
            DataSource = path, Mode = SqliteOpenMode.ReadWrite, Pooling = false }.ToString());
        await connection.OpenAsync(token);
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA busy_timeout=0;";
        await command.ExecuteNonQueryAsync(token);
        command.CommandText = "PRAGMA wal_checkpoint(TRUNCATE);";
        using (var result = await command.ExecuteReaderAsync(token)) {
            if (!await result.ReadAsync(token) || result.GetInt64(0) != 0)
                throw new IOException("Catalog WAL is still in use.");
        }
        command.CommandText = "PRAGMA quick_check;";
        using var interrupt = token.Register(() => SQLitePCL.raw.sqlite3_interrupt(connection.Handle!));
        try {
            if (!string.Equals(await command.ExecuteScalarAsync(token) as string, "ok", StringComparison.Ordinal))
                throw new InvalidDataException("Catalog integrity check failed.");
        }
        catch (SqliteException error) when (error.SqliteErrorCode == 9 && token.IsCancellationRequested) {
            throw new OperationCanceledException("Catalog offline check cancelled.", error, token);
        }
        token.ThrowIfCancellationRequested();
    }
}
