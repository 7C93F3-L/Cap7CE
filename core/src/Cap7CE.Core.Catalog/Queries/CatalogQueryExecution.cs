using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.Queries;

internal static class CatalogQueryExecution
{
    public static async Task<T> RunAsync<T>(SqliteConnection connection, CancellationToken token, Func<Task<T>> query)
    {
        token.ThrowIfCancellationRequested();
        var handle = connection.Handle ?? throw new InvalidOperationException("Query connection is closed.");
        // The registration is disposed before its connection; sqlite3_interrupt is thread-safe.
        using var cancellation = token.Register(() => SQLitePCL.raw.sqlite3_interrupt(handle));
        try
        {
            var result = await query();
            token.ThrowIfCancellationRequested();
            return result;
        }
        catch (SqliteException error) when (error.SqliteErrorCode == 9 && token.IsCancellationRequested)
        {
            throw new OperationCanceledException("Catalog query cancelled.", error, token);
        }
    }
}
