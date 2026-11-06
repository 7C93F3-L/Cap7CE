using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

// Disposable evidence for one uninterrupted checkpoint-expiry rebuild, never a lasting extraction grant.
public sealed class CatalogFactRecovery : IAsyncDisposable
{
    private readonly SqliteConnection staging;
    private readonly SqliteTransaction transaction;
    private bool prepared;
    private bool disposed;
    internal string Path { get; }
    internal string VolumeId { get; }
    internal long Epoch { get; }
    internal long Checkpoint { get; }
    internal string Journal { get; }

    private CatalogFactRecovery(string path, string volume, long epoch, long checkpoint, string journal, SqliteConnection staging)
    { Path = path; VolumeId = volume; Epoch = epoch; Checkpoint = checkpoint; Journal = journal; this.staging = staging; transaction = staging.BeginTransaction(); }

    public static async Task<CatalogFactRecovery?> CaptureAsync(CatalogV2Database catalog,
        CatalogV2VolumeSnapshot volume, CancellationToken token = default)
    {
        if (volume.State is not (CatalogV2VolumeState.Ready or CatalogV2VolumeState.Offline or CatalogV2VolumeState.CatchingUp)
            || volume.CheckpointUsn is not > 0 || volume.JournalId is null) return null;
        var path = catalog.DatabasePath + ".snapshot-" + Guid.NewGuid().ToString("N") + ".db";
        var transferred = false;
        try
        {
            await using (var source = await catalog.OpenAsync(false, token))
            {
                using var attach = source.CreateCommand();
                attach.CommandText = "ATTACH DATABASE $path AS recovery_capture;";
                attach.Parameters.AddWithValue("$path", path);
                await attach.ExecuteNonQueryAsync(token);
                try
                {
                    using var tx = source.BeginTransaction();
                    if (!await FileFactCatalogInvalidation.IsEnabledAsync(source, tx, token)) return null;
                    using var command = source.CreateCommand(); command.Transaction = tx;
                    command.Parameters.AddWithValue("$volume", volume.VolumeId);
                    command.Parameters.AddWithValue("$revision", volume.CatalogRevision);
                    command.CommandText = """
                        SELECT COALESCE(fv.epoch,0) FROM catalog_volumes_v2 v
                        LEFT JOIN file_fact_volumes fv ON fv.volume_id=v.volume_id
                        WHERE v.volume_id=$volume AND v.catalog_revision=$revision;
                        """;
                    if (await command.ExecuteScalarAsync(token) is not long epoch) return null;
                    command.CommandText = """
                        CREATE TABLE recovery_capture.facts AS
                        SELECT ff.volume_id,ff.file_reference,ff.kind,ff.extractor_version,ff.size_bytes,ff.modified_file_time,
                               ff.content_revision,n.created_utc_ticks,n.extension
                        FROM file_facts ff JOIN catalog_nodes_v2 n USING(volume_id,file_reference)
                        LEFT JOIN file_fact_sources fs USING(volume_id,file_reference)
                        WHERE ff.volume_id=$volume AND ff.state=0 AND ff.volume_epoch=$epoch
                          AND ff.content_revision=COALESCE(fs.content_revision,0)
                          AND ff.size_bytes=n.size_bytes AND ff.modified_file_time=n.modified_utc_ticks
                          AND n.exists_flag=1 AND n.is_directory=0 AND (n.attributes & 0x00441400)=0;
                        CREATE UNIQUE INDEX recovery_capture.fact_keys ON facts(file_reference,kind);
                        CREATE TABLE recovery_capture.usns(file_reference TEXT PRIMARY KEY,usn INTEGER NOT NULL) WITHOUT ROWID;
                        CREATE TABLE recovery_capture.evidence AS SELECT em.* FROM catalog_embedded_search em
                        JOIN recovery_capture.facts f USING(volume_id,file_reference,kind);
                        """;
                    command.Parameters.AddWithValue("$epoch", epoch);
                    // Product initialization owns the optional search projection; no user data is migrated here.
                    await command.ExecuteNonQueryAsync(token);
                    command.CommandText = "SELECT EXISTS(SELECT 1 FROM recovery_capture.facts);";
                    if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) == 0) return null;
                    tx.Commit();
                    var staging = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = path, Pooling = false }.ToString());
                    try
                    {
                        await staging.OpenAsync(token);
                        var recovery = new CatalogFactRecovery(path, volume.VolumeId, epoch, volume.CheckpointUsn.Value, volume.JournalId, staging);
                        transferred = true;
                        return recovery;
                    }
                    catch { await staging.DisposeAsync(); throw; }
                }
                finally { using var detach = source.CreateCommand(); detach.CommandText = "DETACH DATABASE recovery_capture;"; await detach.ExecuteNonQueryAsync(CancellationToken.None); }
            }
        }
        finally { if (!transferred) CatalogV2Database.DeleteSnapshotBuildFiles(path); }
    }

    public async Task AppendAsync(IReadOnlyList<(string Reference, long? Usn)> files, CancellationToken token = default)
    {
        foreach (var batch in files.Where(file => file.Usn is > 0 && file.Usn < Checkpoint).Chunk(400))
        {
            using var command = staging.CreateCommand(); command.Transaction = transaction;
            var values = new List<string>(batch.Length);
            for (var i = 0; i < batch.Length; i++)
            {
                values.Add($"($r{i},$u{i})");
                command.Parameters.AddWithValue("$r" + i, batch[i].Reference);
                command.Parameters.AddWithValue("$u" + i, batch[i].Usn!.Value);
            }
            command.CommandText = "INSERT INTO usns SELECT column1,column2 FROM (VALUES " + string.Join(',', values)
                + ") WHERE column1 IN (SELECT file_reference FROM facts) ON CONFLICT(file_reference) DO UPDATE SET usn=excluded.usn;";
            await command.ExecuteNonQueryAsync(token);
        }
    }

    internal async Task AttachAsync(SqliteConnection connection, CancellationToken token)
    {
        await transaction.CommitAsync(token); prepared = true;
        await staging.CloseAsync();
        using var command = connection.CreateCommand(); command.CommandText = "ATTACH DATABASE $path AS fact_recovery;";
        command.Parameters.AddWithValue("$path", Path); await command.ExecuteNonQueryAsync(token);
    }

    internal async Task RestoreAsync(SqliteConnection connection, SqliteTransaction tx, CatalogV2VolumeSnapshot volume, CancellationToken token)
    {
        if (volume.VolumeId != VolumeId || volume.JournalId != Journal || volume.CheckpointUsn is not { } checkpoint || checkpoint < Checkpoint) return;
        using var command = connection.CreateCommand(); command.Transaction = tx;
        command.Parameters.AddWithValue("$volume", VolumeId); command.Parameters.AddWithValue("$oldEpoch", Epoch);
        command.Parameters.AddWithValue("$epoch", checked(Epoch + 2)); command.Parameters.AddWithValue("$checkpoint", Checkpoint);
        command.CommandText = """
            CREATE TABLE fact_recovery.eligible AS
            SELECT f.file_reference,f.kind FROM fact_recovery.facts f
            JOIN fact_recovery.usns u USING(file_reference)
            JOIN snapshot_build.build_nodes n USING(volume_id,file_reference)
            JOIN file_facts ff USING(volume_id,file_reference,kind)
            LEFT JOIN file_fact_sources fs USING(volume_id,file_reference)
            JOIN file_fact_volumes fv USING(volume_id)
            WHERE f.volume_id=$volume AND u.usn>0 AND u.usn<$checkpoint AND fv.epoch=$epoch
              AND ff.volume_epoch=$oldEpoch AND ff.content_revision=f.content_revision
              AND ff.content_revision=COALESCE(fs.content_revision,0) AND ff.state=0
              AND ff.extractor_version=f.extractor_version AND ff.size_bytes=f.size_bytes
              AND ff.modified_file_time=f.modified_file_time
              AND n.exists_flag=1 AND n.is_directory=0 AND (n.attributes & 0x00441400)=0
              AND n.created_utc_ticks=f.created_utc_ticks AND n.extension=f.extension
              AND n.size_bytes=f.size_bytes AND n.modified_utc_ticks=f.modified_file_time;
            UPDATE file_facts SET volume_epoch=$epoch WHERE volume_id=$volume
              AND (file_reference,kind) IN (SELECT file_reference,kind FROM fact_recovery.eligible);
            INSERT OR REPLACE INTO catalog_embedded_search SELECT em.* FROM fact_recovery.evidence em
              JOIN fact_recovery.eligible e USING(file_reference,kind);
            UPDATE file_fact_state SET fact_revision=fact_revision+1 WHERE singleton=1;
            """;
        await command.ExecuteNonQueryAsync(token);
    }

    public async ValueTask DisposeAsync()
    {
        if (disposed) return; disposed = true;
        try { if (!prepared) await transaction.RollbackAsync(); }
        finally { await transaction.DisposeAsync(); await staging.DisposeAsync(); CatalogV2Database.DeleteSnapshotBuildFiles(Path); }
    }
}
