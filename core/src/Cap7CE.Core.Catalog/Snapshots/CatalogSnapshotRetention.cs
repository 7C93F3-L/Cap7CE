using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog;

// The original source/checkpoint stays durable in Catalog until atomic publication.
// Staging can be discarded after a crash and freshly verified on the next attempt.
internal sealed record CatalogSnapshotRetention(long Checkpoint, long FirstUsn, long LowestUsn, long? Total)
{
    internal async Task<CatalogV2VolumeSnapshot> PrepareAsync(SqliteConnection connection, SqliteTransaction transaction,
        CatalogV2VolumeSnapshot volume, CatalogFactRecovery recovery, CancellationToken token)
    {
        if (volume.JournalId != recovery.Journal || volume.CheckpointUsn != recovery.Checkpoint)
            throw new CatalogConcurrencyException("Recovery source checkpoint changed.");
        await RequireEpochAsync(connection, transaction, recovery, token);
        await FileFactCatalogInvalidation.ApplyVolumeAsync(connection, transaction, volume.VolumeId, token);
        var target = volume with { CheckpointUsn = Checkpoint, JournalFirstUsn = FirstUsn, JournalLowestValidUsn = LowestUsn, Total = Total };
        await recovery.RestoreAsync(connection, transaction, target, checked(recovery.Epoch + 1), token);
        return target;
    }

    internal static async Task RequireEpochAsync(SqliteConnection connection, SqliteTransaction transaction,
        CatalogFactRecovery recovery, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.CommandText = "SELECT COALESCE((SELECT epoch FROM file_fact_volumes WHERE volume_id=$volume),0);";
        command.Parameters.AddWithValue("$volume", recovery.VolumeId);
        if (Convert.ToInt64(await command.ExecuteScalarAsync(token)) != recovery.Epoch)
            throw new CatalogConcurrencyException("Recovery source epoch changed.");
    }
}

public sealed partial class CatalogV2Database
{
    private static void BindSnapshotPublication(SqliteCommand update, CatalogV2VolumeSnapshot volume, long recordCount, long revision)
    {
        update.Parameters.AddWithValue("$count", recordCount);
        update.Parameters.AddWithValue("$state", ToStorage(volume.State));
        update.Parameters.AddWithValue("$journal", (object?)volume.JournalId ?? DBNull.Value);
        update.Parameters.AddWithValue("$checkpoint", (object?)volume.CheckpointUsn ?? DBNull.Value);
        update.Parameters.AddWithValue("$first", (object?)volume.JournalFirstUsn ?? DBNull.Value);
        update.Parameters.AddWithValue("$lowest", (object?)volume.JournalLowestValidUsn ?? DBNull.Value);
        update.Parameters.AddWithValue("$total", volume.Total ?? recordCount);
        update.Parameters.AddWithValue("$revision", revision);
        update.Parameters.AddWithValue("$volume", volume.VolumeId);
    }

    public async Task<CatalogV2SnapshotBuild> BeginRetainedSnapshotBuildAsync(string volumeId, string journalId,
        long checkpointUsn, long firstUsn, long lowestUsn, long? total, CatalogFactRecovery recovery,
        CancellationToken token = default, bool captureFileEntries = false)
    {
        ArgumentNullException.ThrowIfNull(recovery);
        if (!string.Equals(databasePath, recovery.CatalogPath, StringComparison.OrdinalIgnoreCase)
            || volumeId != recovery.VolumeId || journalId != recovery.Journal || checkpointUsn < recovery.Checkpoint
            || firstUsn < 0 || lowestUsn < 0 || checkpointUsn < firstUsn || checkpointUsn < lowestUsn || total < 0)
            throw new CatalogStateTransitionException("Recovery snapshot does not match its source.");
        await new DirectoryEntries.CatalogFileEntryActivation(this).RequireWriterAsync(captureFileEntries, token);
        long revision;
        await using (var connection = await OpenAsync(false, token))
        {
            using var transaction = connection.BeginTransaction();
            var volume = await ReadVolumeAsync(connection, transaction, volumeId, token)
                ?? throw new CatalogConcurrencyException("Recovery volume is missing.");
            if (!volume.Selected || volume.CatalogRevision != recovery.SourceRevision
                || volume.State is not (CatalogV2VolumeState.Ready or CatalogV2VolumeState.Offline or CatalogV2VolumeState.CatchingUp)
                || volume.JournalId != recovery.Journal || volume.CheckpointUsn != recovery.Checkpoint)
                throw new CatalogConcurrencyException("Recovery source changed before staging.");
            await CatalogSnapshotRetention.RequireEpochAsync(connection, transaction, recovery, token);
            revision = NextRevision(await ReadRevisionAsync(connection, transaction, token));
            using var command = connection.CreateCommand(); command.Transaction = transaction;
            command.CommandText = "UPDATE catalog_volumes_v2 SET state='catchingUp',catalog_revision=$revision WHERE volume_id=$volume;";
            command.Parameters.AddWithValue("$revision", revision); command.Parameters.AddWithValue("$volume", volumeId);
            await command.ExecuteNonQueryAsync(token); await SetRevisionAsync(connection, transaction, revision, token);
            token.ThrowIfCancellationRequested(); transaction.Commit();
        }
        var path = databasePath + ".snapshot-" + Guid.NewGuid().ToString("N") + ".db";
        var build = await CatalogV2SnapshotBuild.CreateAsync(this, volumeId, path, token, captureFileEntries, revision);
        build.FactRecovery = recovery; build.Retention = new(checkpointUsn, firstUsn, lowestUsn, total);
        return build;
    }
}
