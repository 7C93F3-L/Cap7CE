using System.Diagnostics;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Host.MetadataRecovery;

// Writes only a new recovery database in the supplied private recovery directory.
// No restore, source mutation or activation occurs here.
public sealed class FileFactRecoveryCheckpoint(string databasePath, string recoveryDirectory)
{
    public async Task<string?> CreateBeforeActivationAsync(CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var sourcePath = Path.GetFullPath(databasePath);
        var recoveryRoot = Path.GetFullPath(recoveryDirectory);
        await using var source = new SqliteConnection(new SqliteConnectionStringBuilder {
            DataSource = sourcePath, Mode = SqliteOpenMode.ReadOnly, Pooling = false }.ToString());
        await source.OpenAsync(token);
        // Pin the WAL read snapshot so normal Catalog updates do not restart each backup batch.
        using var snapshot = source.BeginTransaction(deferred: true);
        using var schema = source.CreateCommand();
        schema.Transaction = snapshot;
        schema.CommandText = "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'file_fact_state');";
        // A previously activated database must not produce another full backup on every launch.
        if (Convert.ToInt32(await schema.ExecuteScalarAsync(token)) != 0) return null;
        schema.CommandText = "PRAGMA user_version;";
        if (Convert.ToInt32(await schema.ExecuteScalarAsync(token)) != 2)
            throw new InvalidDataException("metadata-recovery-catalog-version");
        Directory.CreateDirectory(recoveryRoot);
        var output = Path.Combine(recoveryRoot, "before-file-facts-" + Guid.NewGuid().ToString("N") + ".sqlite");
        var partial = output + ".partial";
        var reserved = false;
        try
        {
            // CreateNew gives this invocation sole ownership of the only file it may delete.
            using (File.Open(partial, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { }
            reserved = true;
            await using (var destination = new SqliteConnection(new SqliteConnectionStringBuilder {
                DataSource = partial, Mode = SqliteOpenMode.ReadWrite, Pooling = false }.ToString()))
            {
                await destination.OpenAsync(token);
                using (var backup = SQLitePCL.raw.sqlite3_backup_init(destination.Handle!, "main", source.Handle!, "main")
                    ?? throw new InvalidOperationException("metadata-recovery-backup-init"))
                {
                    var elapsed = Stopwatch.StartNew();
                    while (true)
                    {
                        token.ThrowIfCancellationRequested();
                        if (elapsed.Elapsed > TimeSpan.FromSeconds(90)) throw new TimeoutException("metadata-recovery-timeout");
                        var result = SQLitePCL.raw.sqlite3_backup_step(backup, 256);
                        if (result == SQLitePCL.raw.SQLITE_DONE) break;
                        if (result is not (SQLitePCL.raw.SQLITE_OK or SQLitePCL.raw.SQLITE_BUSY or SQLitePCL.raw.SQLITE_LOCKED))
                            throw new InvalidDataException("metadata-recovery-backup-failed");
                        await Task.Delay(result == SQLitePCL.raw.SQLITE_OK ? 5 : 25, token);
                    }
                }
                using var verify = destination.CreateCommand();
                verify.CommandText = "PRAGMA quick_check;";
                token.ThrowIfCancellationRequested();
                using var interrupt = token.Register(() => SQLitePCL.raw.sqlite3_interrupt(destination.Handle!));
                try
                {
                    if (!string.Equals(await verify.ExecuteScalarAsync(token) as string, "ok", StringComparison.Ordinal))
                        throw new InvalidDataException("metadata-recovery-integrity-failed");
                }
                catch (SqliteException error) when (error.SqliteErrorCode == 9 && token.IsCancellationRequested)
                {
                    throw new OperationCanceledException("Metadata recovery validation cancelled.", error, token);
                }
            }
            token.ThrowIfCancellationRequested();
            File.Move(partial, output); // Never overwrite an existing recovery point.
            reserved = false;
            return output;
        }
        finally
        {
            if (reserved) File.Delete(partial);
        }
    }
}
