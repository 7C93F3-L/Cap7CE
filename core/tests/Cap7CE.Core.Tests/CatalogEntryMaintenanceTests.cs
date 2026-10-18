using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.CatalogStorage;
using Cap7CE.Core.Host.MetadataRecovery;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogEntryMaintenanceTests
{
    public static async Task RunAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        var path = fixture.DatabasePath; var root = Path.GetDirectoryName(path)!;
        var recovery = Path.Combine(root, "recovery");
        var catalog = new CatalogV2Database(path); await catalog.InitializeAsync();
        await SqlAsync(path, "CREATE TABLE fixture_marker(value INTEGER); INSERT INTO fixture_marker VALUES(0);");
        var maintenance = new CatalogEntryMaintenance(path, recovery);
        using (var cancelled = new CancellationTokenSource()) {
            cancelled.Cancel();
            await TestAssert.ThrowsAsync<OperationCanceledException>(() => maintenance.UpgradeAsync(cancelled.Token), "pre-cancelled upgrade is inert");
            TestAssert.False(File.Exists(path + ".owner"), "cancelled upgrade creates no owner file");
        }
        using (CatalogStorageLease.Acquire(path)) {
            await TestAssert.ThrowsAsync<IOException>(() => maintenance.UpgradeAsync(), "maintenance cannot interrupt a storage owner");
            TestAssert.False(Directory.Exists(recovery), "busy owner creates no recovery output");
        }
        // The leftover empty sidecar is reusable; an actual SQLite handle from
        // an older process, which knows no sidecar, also blocks maintenance.
        await using (var oldWriter = new SqliteConnection(new SqliteConnectionStringBuilder {
            DataSource = path, Mode = SqliteOpenMode.ReadWrite, Pooling = false }.ToString())) {
            await oldWriter.OpenAsync();
            using var held = oldWriter.CreateCommand(); held.CommandText = "SELECT COUNT(*) FROM fixture_marker;";
            await held.ExecuteScalarAsync();
            await TestAssert.ThrowsAsync<IOException>(() => maintenance.UpgradeAsync(), "pre-sidecar active writer blocks offline maintenance");
        }
        var blocked = Path.Combine(root, "blocked"); await File.WriteAllTextAsync(blocked, "preserve");
        await TestAssert.ThrowsAsync<IOException>(() => new CatalogEntryMaintenance(path, blocked).UpgradeAsync(), "failed backup never activates");
        TestAssert.Equal("preserve", await File.ReadAllTextAsync(blocked), "existing backup destination preserved");
        TestAssert.False(await new CatalogFileEntryActivation(catalog).ReadEnabledAsync(), "backup failure preserves mode 2");
        await SqlAsync(path, "CREATE TRIGGER reject_entry BEFORE UPDATE ON catalog_state_v2 BEGIN SELECT RAISE(ABORT,'entry'); END;");
        await TestAssert.ThrowsAsync<SqliteException>(() => maintenance.UpgradeAsync(), "SQL failure preserves its completed recovery point");
        TestAssert.False(await new CatalogFileEntryActivation(catalog).ReadEnabledAsync(), "activation failure keeps mode 2");
        TestAssert.Equal(1, Directory.GetFiles(recovery, "before-entries-*.sqlite").Length, "failed activation retains the recovery point");
        await SqlAsync(path, "DROP TRIGGER reject_entry;");
        var upgraded = await maintenance.UpgradeAsync();
        TestAssert.True(upgraded.Activated && File.Exists(upgraded.RecoveryPath!), "activation follows a completed snapshot");
        var before = upgraded.RecoveryPath!;
        TestAssert.False(await new CatalogFileEntryActivation(new(before)).ReadEnabledAsync(), "checkpoint retains the legacy format");
        TestAssert.Equal("delete", await SqlAsync(before, "PRAGMA journal_mode;"), "recovery file needs no WAL sidecar");
        TestAssert.False(File.Exists(before + "-wal"), "standalone recovery has no WAL");
        TestAssert.False((await maintenance.UpgradeAsync()).Activated, "repeated maintenance does not activate again");
        TestAssert.Equal(2, Directory.GetFiles(recovery, "before-entries-*.sqlite").Length, "restart creates no redundant checkpoint");
        // File-fact first activation must also accept a validated storage-3 Catalog.
        var factRecovery = (await new FileFactRecoveryCheckpoint(path, recovery).CreateBeforeActivationAsync(CancellationToken.None))!;
        TestAssert.True(await new CatalogFileEntryActivation(new(factRecovery)).ReadEnabledAsync(), "fact checkpoint preserves entry storage");
        await new FileFactDatabase(path).InitializeAsync();
        TestAssert.True(await new FileFactRecoveryCheckpoint(path, recovery).CreateBeforeActivationAsync(CancellationToken.None) is null, "fact checkpoint remains idempotent");
        await SqlAsync(path, "UPDATE fixture_marker SET value=42;");
        await TestAssert.ThrowsAsync<InvalidDataException>(() => maintenance.RollbackAsync(factRecovery), "entry snapshot is not a legacy rollback source");
        var invalid = Path.Combine(root, "invalid.sqlite"); await File.WriteAllTextAsync(invalid, "preserve-invalid");
        await TestAssert.ThrowsAsync<SqliteException>(() => maintenance.RollbackAsync(invalid), "unrelated file is not a rollback source");
        TestAssert.Equal("preserve-invalid", await File.ReadAllTextAsync(invalid), "invalid input is not changed");
        using (var cancelled = new CancellationTokenSource()) {
            cancelled.Cancel();
            await TestAssert.ThrowsAsync<OperationCanceledException>(() => maintenance.RollbackAsync(before, cancelled.Token), "cancelled rollback is inert");
        }
        TestAssert.Equal("42", await SqlAsync(path, "SELECT value FROM fixture_marker;"), "rejected rollback preserves current data");
        var restored = await maintenance.RollbackAsync(before);
        TestAssert.False(await new CatalogFileEntryActivation(new(path)).ReadEnabledAsync(), "rollback restores the full legacy database");
        TestAssert.Equal("0", await SqlAsync(path, "SELECT value FROM fixture_marker;"), "pre-upgrade data restored");
        var archive = restored.PreservedEntryCatalogPath;
        TestAssert.True(await new CatalogFileEntryActivation(new(archive)).ReadEnabledAsync(), "post-upgrade database preserved separately");
        TestAssert.Equal("42", await SqlAsync(archive, "SELECT value FROM fixture_marker;"), "post-upgrade data is not lost");
        TestAssert.Equal("ok", await SqlAsync(path, "PRAGMA quick_check;"), "restored SQLite integrity");
        TestAssert.Equal("ok", await SqlAsync(archive, "PRAGMA quick_check;"), "archived SQLite integrity");
        TestAssert.Equal(0, Directory.GetFiles(root, "entry-restore-*").Length, "successful restore consumes only its staged file");
        TestAssert.True(File.Exists(before), "legacy recovery input retained");
        var missing = Path.Combine(root, "missing.db");
        await TestAssert.ThrowsAsync<FileNotFoundException>(() => new CatalogEntryMaintenance(missing, recovery).UpgradeAsync(), "maintenance never creates missing storage");
        TestAssert.False(File.Exists(missing), "missing source stays absent");
        await CancellationDuringCopyAsync();
    }

    private static async Task CancellationDuringCopyAsync()
    {
        using var fixture = new TemporaryCatalogFixture(); var path = fixture.DatabasePath;
        var root = Path.GetDirectoryName(path)!; var recovery = Path.Combine(root, "recovery");
        await new CatalogV2Database(path).InitializeAsync();
        await SqlAsync(path, "CREATE TABLE fixture_payload(data BLOB); INSERT INTO fixture_payload VALUES(zeroblob(33554432));");
        var maintenance = new CatalogEntryMaintenance(path, recovery);
        using (var cancellation = new CancellationTokenSource()) {
            var running = maintenance.UpgradeAsync(cancellation.Token);
            TestAssert.Equal(1, Directory.GetFiles(recovery, "*.partial").Length, "upgrade copy is active");
            cancellation.Cancel();
            await TestAssert.ThrowsAsync<OperationCanceledException>(() => running, "copy cancellation cannot publish entry mode");
        }
        TestAssert.False(await new CatalogFileEntryActivation(new(path)).ReadEnabledAsync(), "interrupted copy leaves legacy source intact");
        TestAssert.Equal(0, Directory.GetFiles(recovery).Length, "interrupted upgrade removes only its own partial");
        var upgrade = await maintenance.UpgradeAsync();
        using (var cancellation = new CancellationTokenSource()) {
            var running = maintenance.RollbackAsync(upgrade.RecoveryPath!, cancellation.Token);
            TestAssert.Equal(1, Directory.GetFiles(root, "entry-restore-*.partial").Length, "restore copy is active");
            cancellation.Cancel();
            await TestAssert.ThrowsAsync<OperationCanceledException>(() => running, "restore copy cancellation does not replace current storage");
        }
        TestAssert.True(await new CatalogFileEntryActivation(new(path)).ReadEnabledAsync(), "interrupted rollback leaves current mode intact");
        TestAssert.Equal(0, Directory.GetFiles(root, "entry-restore-*").Length, "interrupted restore removes its own partial");
        TestAssert.True(File.Exists(upgrade.RecoveryPath!), "cancelled rollback preserves its input snapshot");
        TestAssert.Equal("33554432", await SqlAsync(path, "SELECT length(data) FROM fixture_payload;"), "cancelled rollback preserves current data");
        var blockedRestore = maintenance.RollbackAsync(upgrade.RecoveryPath!);
        TestAssert.Equal(1, Directory.GetFiles(root, "entry-restore-*.partial").Length, "restore stages before its final exclusive preflight");
        using (File.Open(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) {
            await TestAssert.ThrowsAsync<IOException>(() => blockedRestore, "a handle acquired during staging prevents replacement");
        }
        TestAssert.True(await new CatalogFileEntryActivation(new(path)).ReadEnabledAsync(), "late occupancy leaves active storage intact");
        TestAssert.Equal(0, Directory.GetFiles(root, "entry-restore-*").Length, "failed final preflight removes only its stage");
        TestAssert.True(File.Exists(upgrade.RecoveryPath!), "late occupancy preserves the original recovery point");
    }
    private static async Task<string> SqlAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection(new SqliteConnectionStringBuilder {
            DataSource = path, Mode = SqliteOpenMode.ReadWrite, Pooling = false }.ToString()); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql;
        return Convert.ToString(await command.ExecuteScalarAsync()) ?? "";
    }
}
