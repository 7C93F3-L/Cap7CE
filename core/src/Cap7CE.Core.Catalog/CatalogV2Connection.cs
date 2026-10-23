using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog;

// Owns only connection opening and connection-scoped SQLite safety settings.
// Initial validation uses a non-pooled connection so an invalid database cannot
// retain a native handle after its validation scope has ended.
internal static class CatalogV2Connection
{
    public static async Task<SqliteConnection> OpenAsync(string path, bool readOnly, bool requireExisting, bool pooling, CancellationToken token)
    {
        var connection = new SqliteConnection(new SqliteConnectionStringBuilder {
            DataSource = path,
            Mode = readOnly ? SqliteOpenMode.ReadOnly : requireExisting ? SqliteOpenMode.ReadWrite : SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Private, Pooling = pooling
        }.ToString());
        try {
            await connection.OpenAsync(token);
            connection.CreateCollation("CAP7CE_NATURAL", (left,right)=>System.Globalization.CultureInfo.GetCultureInfo("en").CompareInfo.Compare(
                left,right,System.Globalization.CompareOptions.IgnoreCase|System.Globalization.CompareOptions.IgnoreNonSpace|System.Globalization.CompareOptions.NumericOrdering));
            using var command = connection.CreateCommand();
            command.CommandText = "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = FULL; PRAGMA trusted_schema = OFF;";
            await command.ExecuteNonQueryAsync(token);
            return connection;
        }
        catch { SqliteConnection.ClearPool(connection); await connection.DisposeAsync(); throw; }
    }
}
