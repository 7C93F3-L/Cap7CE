using Cap7CE.Core.Catalog;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogWalConcurrencyTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-wal-read-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var path = Path.Combine(root, "catalog.db");
            var catalog = new CatalogV2Database(path);
            await catalog.InitializeAsync();
            await using var writer = new SqliteConnection(new SqliteConnectionStringBuilder {
                DataSource = path, Cache = SqliteCacheMode.Shared, Pooling = false
            }.ToString());
            await writer.OpenAsync();
            using var transaction = writer.BeginTransaction();
            using var update = writer.CreateCommand(); update.Transaction = transaction;
            update.CommandText = "UPDATE catalog_state_v2 SET catalog_revision=1 WHERE singleton=1;";
            await update.ExecuteNonQueryAsync();
            var read = Task.Run(() => catalog.ReadRevisionAsync());
            try
            {
                var committed = await read.WaitAsync(TimeSpan.FromSeconds(2));
                TestAssert.Equal(0L, committed, "foreground reads see committed WAL state during an open maintenance write");
            }
            finally
            {
                transaction.Rollback();
                await read;
            }
            TestAssert.Equal(0L, await catalog.ReadRevisionAsync(), "rollback preserves the Catalog revision");
        }
        finally
        {
            SqliteConnection.ClearAllPools(); Directory.Delete(root, true);
        }
    }
}
