using System.Diagnostics;
using Microsoft.Data.Sqlite;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host.CatalogStorage;

// Independent query-only connection: never initializes, repairs or checkpoints storage.
// ReadWrite (not ReadWriteCreate) preserves CHECK diagnostics in the bundled SQLite;
// query_only blocks SQL mutations before the check is prepared.
public static class CatalogHealthCheck
{
    public static async Task<CatalogHealthReport> RunAsync(string path, CancellationToken token = default)
    {
        var watch = Stopwatch.StartNew();
        var problems = new List<string>();
        var truncated = false;
        try {
            await using var connection = new SqliteConnection(new SqliteConnectionStringBuilder {
                DataSource = path, Mode = SqliteOpenMode.ReadWrite, Pooling = false }.ToString());
            await connection.OpenAsync(token);
            using var command = connection.CreateCommand();
            command.CommandText = "PRAGMA query_only=ON;";
            await command.ExecuteNonQueryAsync(token);
            command.CommandText = "PRAGMA quick_check;";
            using var interrupt = token.Register(() => SQLitePCL.raw.sqlite3_interrupt(connection.Handle!));
            await using var reader = await command.ExecuteReaderAsync(token);
            while (await reader.ReadAsync(token)) {
                var text = reader.GetString(0);
                if (text == "ok") continue;
                if (problems.Count < 100) problems.Add(text[..Math.Min(text.Length, 512)]);
                else truncated = true;
            }
            token.ThrowIfCancellationRequested();
            return Result(problems.Count == 0 ? "ok" : "issues");
        }
        catch (Exception error) when (!token.IsCancellationRequested && error is SqliteException or IOException or UnauthorizedAccessException) {
            problems.Add(error.Message[..Math.Min(error.Message.Length, 512)]);
            return Result("error"); // Failure to run is not a corruption diagnosis.
        }
        CatalogHealthReport Result(string status) => new(status, DateTimeOffset.UtcNow,
            Math.Round(watch.Elapsed.TotalMilliseconds, 2), problems.ToArray(), truncated);
    }
}
