using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactChangeLogTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-fact-change-log-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); var path = Path.Combine(root, "fixture.db");
        try
        {
            var catalog = new CatalogV2Database(path); await catalog.InitializeAsync();
            await catalog.RegisterVolumeAsync("v", "X:", "NTFS", true);
            await catalog.BeginBuildAsync("v", "42", 10, 0, 0, 2, false);
            var folder = new CatalogV2NodeRecord(new("v", "0000000000000001"), null, "root", "", true, 16, true, null, 1, 1);
            var file = new CatalogV2NodeRecord(new("v", "0000000000000002"), folder.Identity.FileReference, "one.csv", ".csv", false, 32, true, 100, 1, 2);
            var checkpoint = 10L;
            async Task ApplyAsync(params CatalogV2NodeRecord[] nodes) {
                await catalog.ApplyBatchAsync(new("v", "42", checkpoint, await catalog.ReadRevisionAsync(), checkpoint + 1, 0, 0, nodes)); checkpoint++;
            }
            await ApplyAsync(folder, file); await catalog.CompleteSynchronizationAsync("v");
            await catalog.BeginCatchUpAsync("v", "42", 0, 0); await ApplyAsync(file with { Name = "ungranted.csv" });
            await catalog.CompleteSynchronizationAsync("v");
            TestAssert.Equal(0L, await ScalarAsync(path, "SELECT COUNT(*) FROM sqlite_master WHERE name='file_fact_catalog_changes';"), "Catalog changes cannot initialize ungranted facts");
            await new FileFactDatabase(path).InitializeAsync(); var log = new FileFactChangeLog(path);
            await catalog.BeginCatchUpAsync("v", "42", 0, 0);
            await ApplyAsync(file, file with { Name = "latest.csv" }, folder);
            await catalog.CompleteSynchronizationAsync("v");
            var first = await log.ReadPageAsync(); TestAssert.Equal(2, first.Count, "batch duplicate identities collapse");
            TestAssert.True(first.Single(change => change.Identity == folder.Identity).ScanDescendants, "directory hint requires bounded subtree discovery");
            TestAssert.False(first.Single(change => change.Identity == file.Identity).ScanDescendants, "file hint remains identity-only");
            var older = first.Single(change => change.Identity == file.Identity);
            await catalog.BeginCatchUpAsync("v", "42", 0, 0); await ApplyAsync(file with { Name = "newer.csv" });
            await catalog.CompleteSynchronizationAsync("v");
            await new FileFactChangeLog(path).AcknowledgeAsync([older]);
            var newer = (await new FileFactChangeLog(path).ReadPageAsync()).Single(change => change.Identity == file.Identity);
            TestAssert.True(newer.Sequence > older.Sequence, "reopened log retains newer generation despite stale acknowledgment");
            await log.AcknowledgeAsync(await log.ReadPageAsync());
            TestAssert.Equal(0, (await log.ReadPageAsync()).Count, "exact generation acknowledgment drains log");
            await catalog.BeginCatchUpAsync("v", "42", 0, 0);
            await ExecuteAsync(path, "CREATE TRIGGER reject_checkpoint BEFORE UPDATE ON catalog_volumes_v2 WHEN NEW.checkpoint_usn <> OLD.checkpoint_usn BEGIN SELECT RAISE(ABORT,'fixture-rollback'); END;");
            await TestAssert.ThrowsAsync<SqliteException>(() => ApplyAsync(file), "failed Catalog batch rolls back change hint");
            TestAssert.Equal(0, (await log.ReadPageAsync()).Count, "hint cannot outlive failed base transaction");
            await ExecuteAsync(path, "DROP TRIGGER reject_checkpoint;"); await catalog.CompleteSynchronizationAsync("v");
            await catalog.BeginCatchUpAsync("v", "42", 0, 0);
            await ApplyAsync(Enumerable.Range(3, 8).Select(number => file with { Identity = new("v", number.ToString("X16")), Name = $"file-{number}.csv" }).ToArray());
            await catalog.CompleteSynchronizationAsync("v");
            var page = await log.ReadPageAsync(3); TestAssert.Equal(3, page.Count, "change pages bounded");
            await log.AcknowledgeAsync(page); TestAssert.Equal(5, (await log.ReadPageAsync()).Count, "acknowledgment preserves other page hints");
            await catalog.MarkNeedsRebuildAsync("v"); await catalog.BeginBuildAsync("v", "42", checkpoint, 0, 0, 2, true);
            await ApplyAsync(folder, file); await catalog.CompleteSynchronizationAsync("v");
            TestAssert.True((await log.ReadPageAsync()).Any(change => change.Identity.FileReference == "0000000000000000" && change.ScanDescendants), "rebuild retains volume-wide re-discovery hint");
            await TestAssert.ThrowsAsync<ArgumentOutOfRangeException>(() => log.ReadPageAsync(513), "unbounded changes rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => log.AcknowledgeAsync([new(0, file.Identity, false)]), "invalid acknowledgment rejected before write");
            TestAssert.True(await catalog.CheckIntegrityAsync(), "change log and Catalog integrity");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
    private static async Task ExecuteAsync(string path, string sql) {
        await using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; await command.ExecuteNonQueryAsync();
    }
    private static async Task<long> ScalarAsync(string path, string sql) {
        await using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; return Convert.ToInt64(await command.ExecuteScalarAsync());
    }
}
