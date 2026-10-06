using System.Diagnostics;
using Cap7CE.Core.Catalog;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogQueryCancellationTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-sql-cancel-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "fixture.db");
        try
        {
            var catalog = new CatalogV2Database(path);
            await catalog.InitializeAsync();
            await using (var connection = new SqliteConnection($"Data Source={path};Pooling=False"))
            {
                await connection.OpenAsync(); using var command = connection.CreateCommand();
                // Virtual synthetic nodes force native work without storing or reading source files.
                command.CommandText = """
                    INSERT INTO catalog_volumes_v2 VALUES('fixture','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                    ALTER TABLE catalog_nodes_v2 RENAME TO fixture_nodes;
                    CREATE VIEW catalog_nodes_v2 AS
                    WITH RECURSIVE sequence(x) AS(SELECT 1 UNION ALL SELECT x + 1 FROM sequence WHERE x < 3000000)
                    SELECT 'fixture' AS volume_id, printf('%016X', x) AS file_reference,
                        NULL AS parent_file_reference, 'entry-' || x AS name, '.png' AS extension,
                        0 AS is_directory, 32 AS attributes, 1 AS exists_flag, 100 AS size_bytes,
                        1 AS created_utc_ticks, 1 AS modified_utc_ticks FROM sequence;
                    """;
                await command.ExecuteNonQueryAsync();
            }
            using var cancellation = new CancellationTokenSource();
            var started = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            var work = Task.Run(async () =>
            {
                started.SetResult(true);
                return await catalog.QueryAsync(new("__no_matching_entry__", [], CatalogQueryScope.AllVolumes(), null,
                    CatalogEntryType.File, 100, null), cancellation.Token);
            });
            await started.Task;
            var watch = Stopwatch.StartNew();
            cancellation.CancelAfter(100);
            try
            {
                await work.WaitAsync(TimeSpan.FromSeconds(5));
                throw new InvalidOperationException("Native scan must be interrupted.");
            }
            catch (OperationCanceledException error)
            {
                TestAssert.True(error.InnerException is SqliteException { SqliteErrorCode: 9 }, "cancellation interrupts native SQLite, not only managed row iteration");
                TestAssert.True(watch.Elapsed < TimeSpan.FromSeconds(2), "native cancellation bounded");
            }
            TestAssert.Equal(0L, await catalog.ReadRevisionAsync(), "cancelled reader leaves base revision intact");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
}
