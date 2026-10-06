using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataRecovery;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactRecoveryCheckpointTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-metadata-recovery-" + Guid.NewGuid().ToString("N"));
        var path = Path.Combine(root, "catalog.db");
        var recovery = Path.Combine(root, "recovery");
        try
        {
            await new CatalogV2Database(path).InitializeAsync();
            var checkpoint = new FileFactRecoveryCheckpoint(path, recovery);
            using var cancelled = new CancellationTokenSource();
            cancelled.Cancel();
            await TestAssert.ThrowsAsync<OperationCanceledException>(() => checkpoint.CreateBeforeActivationAsync(cancelled.Token), "cancelled checkpoint does not activate");
            TestAssert.False(Directory.Exists(recovery), "pre-cancelled backup creates no recovery directory");
            var large = Path.Combine(root, "large.db");
            await new CatalogV2Database(large).InitializeAsync();
            await using (var writer = new SqliteConnection(new SqliteConnectionStringBuilder {
                DataSource = large, Mode = SqliteOpenMode.ReadWrite, Pooling = false }.ToString()))
            {
                await writer.OpenAsync();
                using var fill = writer.CreateCommand();
                fill.CommandText = "CREATE TABLE fixture_payload(data BLOB); INSERT INTO fixture_payload VALUES(zeroblob(33554432)); CREATE TABLE fixture_marker(value INTEGER); INSERT INTO fixture_marker VALUES(0);";
                await fill.ExecuteNonQueryAsync();
            }
            using var duringCopy = new CancellationTokenSource(20);
            var interruptedRoot = Path.Combine(root, "interrupted");
            await TestAssert.ThrowsAsync<OperationCanceledException>(
                () => new FileFactRecoveryCheckpoint(large, interruptedRoot).CreateBeforeActivationAsync(duringCopy.Token), "page copying responds to cancellation");
            TestAssert.True(!Directory.Exists(interruptedRoot) || Directory.GetFiles(interruptedRoot).Length == 0, "cancelled copy deletes only its own partial output");
            var concurrentRoot = Path.Combine(root, "concurrent");
            var copying = new FileFactRecoveryCheckpoint(large, concurrentRoot).CreateBeforeActivationAsync(CancellationToken.None);
            // The copier has established its read transaction before creating the owned output.
            TestAssert.True(Directory.GetFiles(concurrentRoot, "*.partial").Length == 1, "backup is active after its first page batch");
            await using (var writer = new SqliteConnection(new SqliteConnectionStringBuilder {
                DataSource = large, Mode = SqliteOpenMode.ReadWrite, Pooling = false }.ToString()))
            {
                await writer.OpenAsync();
                using var update = writer.CreateCommand();
                update.CommandText = "UPDATE fixture_marker SET value = 1;";
                await update.ExecuteNonQueryAsync();
            }
            var concurrentOutput = (await copying)!;
            await using (var before = new SqliteConnection(new SqliteConnectionStringBuilder {
                DataSource = concurrentOutput, Mode = SqliteOpenMode.ReadOnly, Pooling = false }.ToString()))
            {
                await before.OpenAsync();
                using var marker = before.CreateCommand();
                marker.CommandText = "SELECT value FROM fixture_marker;";
                TestAssert.Equal(0L, Convert.ToInt64(await marker.ExecuteScalarAsync()), "WAL writer continues while recovery preserves the earlier snapshot");
            }
            var blocked = Path.Combine(root, "blocked");
            await File.WriteAllTextAsync(blocked, "preserve-existing-content");
            await TestAssert.ThrowsAsync<IOException>(
                () => new FileFactRecoveryCheckpoint(path, blocked).CreateBeforeActivationAsync(CancellationToken.None), "failed destination does not initialize source");
            TestAssert.Equal("preserve-existing-content", await File.ReadAllTextAsync(blocked), "failed backup preserves existing destination content");
            var output = (await checkpoint.CreateBeforeActivationAsync(CancellationToken.None))!;
            TestAssert.True(File.Exists(output), "completed checkpoint is retained");
            TestAssert.Equal(0, Directory.GetFiles(recovery, "*.partial").Length, "completed checkpoint leaves no partial database");
            await new FileFactDatabase(path).InitializeAsync();
            TestAssert.True(await checkpoint.CreateBeforeActivationAsync(CancellationToken.None) is null, "activated catalog does not repeatedly copy on restart");
            TestAssert.Equal(1, Directory.GetFiles(recovery, "*.sqlite").Length, "original recovery point is preserved");
            await using var backup = new SqliteConnection(new SqliteConnectionStringBuilder {
                DataSource = output, Mode = SqliteOpenMode.ReadOnly, Pooling = false }.ToString());
            await backup.OpenAsync();
            using var command = backup.CreateCommand();
            command.CommandText = "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name = 'file_fact_state');";
            TestAssert.Equal(0L, Convert.ToInt64(await command.ExecuteScalarAsync()), "checkpoint predates metadata initialization");
            command.CommandText = "PRAGMA quick_check;";
            TestAssert.Equal("ok", (string)(await command.ExecuteScalarAsync())!, "recovery SQLite integrity");
            var missing = Path.Combine(root, "missing.db");
            await TestAssert.ThrowsAsync<SqliteException>(() => new FileFactRecoveryCheckpoint(missing, recovery).CreateBeforeActivationAsync(CancellationToken.None), "backup does not create missing source");
            TestAssert.False(File.Exists(missing), "missing source remains absent");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
}
