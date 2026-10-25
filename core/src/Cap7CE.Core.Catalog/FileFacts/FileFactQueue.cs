using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

// Durable dispatch ledger only; workers, source access and user-visible progress belong to the host.
public sealed class FileFactQueue(string databasePath, TimeProvider? timeProvider = null)
{
    public static void ValidatePolicy(FileFactQueuePolicy policy) => _ = FileFactQueueScope.Serialize(policy);
    private readonly FileFactDatabase facts = new(databasePath);
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;

    public async Task InitializeAsync(CancellationToken token = default)
    {
        await facts.InitializeAsync(token);
        await using var connection = await facts.OpenAsync(false, token);
        await FileFactQueueSchema.InitializeAsync(connection, token);
    }

    public async Task SetPolicyAsync(FileFactQueuePolicy policy, CancellationToken token = default)
    {
        var json = FileFactQueueScope.Serialize(policy);
        await using var connection = await OpenAsync(token);
        using var transaction = connection.BeginTransaction(deferred: false);
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "UPDATE file_fact_queue_state SET policy_epoch = policy_epoch + 1, policy_json = $json WHERE singleton = 1 AND policy_json <> $json;";
        command.Parameters.AddWithValue("$json", json);
        if (await command.ExecuteNonQueryAsync(token) == 1)
        {
            command.CommandText = """
                UPDATE file_fact_jobs SET state = 'pending', lease_id = NULL, lease_expires = NULL, policy_epoch = NULL
                    WHERE state = 'leased';
                """;
            await command.ExecuteNonQueryAsync(token);
        }
        transaction.Commit();
    }

    public async Task EnqueueAsync(IReadOnlyList<FileFactJob> jobs, CancellationToken token = default)
    {
        ArgumentNullException.ThrowIfNull(jobs);
        if (jobs.Count > CatalogV2Contract.MaximumBatchNodes) throw new ArgumentException("Job batch is too large.");
        foreach (var job in jobs)
        {
            ArgumentNullException.ThrowIfNull(job);
            FileFactDatabase.ValidateIdentity(job.Identity);
            if (!Enum.IsDefined(job.Kind) || job.ExtractorVersion <= 0) throw new ArgumentException("Invalid job.");
        }
        await using var connection = await OpenAsync(token);
        using var transaction = connection.BeginTransaction(deferred: false);
        foreach (var job in jobs.Distinct())
        {
            var source = await FileFactDatabase.CaptureAsync(connection, transaction, job.Identity, token);
            if (source is null) continue;
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = """
                INSERT INTO file_fact_jobs(volume_id, file_reference, kind, extractor_version, size_bytes,
                    modified_file_time, volume_epoch, content_revision, state)
                SELECT $volume, $reference, $kind, $extractor, $size, $modified, $epoch, $revision, 'pending'
                WHERE NOT EXISTS(SELECT 1 FROM file_facts WHERE volume_id = $volume AND file_reference = $reference
                    AND kind = $kind AND extractor_version >= $extractor AND size_bytes = $size
                    AND modified_file_time = $modified AND volume_epoch = $epoch AND content_revision = $revision)
                ON CONFLICT(volume_id, file_reference, kind, extractor_version) DO UPDATE SET
                    size_bytes = excluded.size_bytes, modified_file_time = excluded.modified_file_time,
                    volume_epoch = excluded.volume_epoch, content_revision = excluded.content_revision,
                    state = 'pending', lease_id = NULL, lease_expires = NULL, policy_epoch = NULL
                WHERE file_fact_jobs.size_bytes <> excluded.size_bytes
                    OR file_fact_jobs.modified_file_time <> excluded.modified_file_time
                    OR file_fact_jobs.volume_epoch <> excluded.volume_epoch
                    OR file_fact_jobs.content_revision <> excluded.content_revision;
                """;
            BindJob(command, job, source);
            await command.ExecuteNonQueryAsync(token);
            await FileFactEntryJobHints.WriteAsync(connection, transaction, job, source, token);
        }
        transaction.Commit();
    }

    public async Task<FileFactLease?> ClaimAsync(int leaseMilliseconds = 30_000, CancellationToken token = default,
        FileFactClaimSpecification? specification = null)
    {
        ValidateDuration(leaseMilliseconds);
        FileFactSelection.Validate(specification);
        await using var connection = await OpenAsync(token);
        using var transaction = connection.BeginTransaction(deferred: false);
        var now = clock.GetUtcNow().ToUnixTimeMilliseconds();
        using var recover = connection.CreateCommand();
        recover.Transaction = transaction;
        recover.CommandText = """
            UPDATE file_fact_jobs SET state = 'pending', lease_id = NULL, lease_expires = NULL, policy_epoch = NULL
                WHERE state = 'leased' AND lease_expires <= $now;
            """;
        recover.Parameters.AddWithValue("$now", now);
        await recover.ExecuteNonQueryAsync(token);
        var (policy, epoch) = await ReadPolicyAsync(connection, transaction, token);
        using var find = connection.CreateCommand();
        find.Transaction = transaction;
        var scope = await FileFactEntryPolicy.BindAsync(find, policy, token);
        var selected = FileFactSelection.Bind(find, specification);
        find.CommandText = $"""
            SELECT j.volume_id, j.file_reference, j.kind, j.extractor_version FROM file_fact_jobs j INDEXED BY file_fact_jobs_pending
            CROSS JOIN catalog_nodes_v2 n ON n.volume_id = j.volume_id AND n.file_reference = j.file_reference
            JOIN catalog_volumes_v2 c ON c.volume_id = n.volume_id
            WHERE j.state = 'pending' AND j.volume_id = $claimVolume AND n.exists_flag = 1 AND n.is_directory = 0
                AND (n.attributes & 0x00441400) = 0
                AND n.size_bytes IS NOT NULL AND n.modified_utc_ticks IS NOT NULL
                AND c.selected = 1 AND c.state = 'ready' AND {scope} AND ({selected})
            ORDER BY j.ordinal LIMIT 1;
            """;
        FileFactJob? job = null;
        var claimVolume = find.Parameters.Add("$claimVolume", SqliteType.Text);
        foreach (var volume in policy.VolumeOrder.Where(volume => specification?.VolumeId is null || specification.VolumeId == volume)) {
            token.ThrowIfCancellationRequested();claimVolume.Value = volume;
            using var reader = await find.ExecuteReaderAsync(token);
            if (await reader.ReadAsync(token)) {
                job = new(new(reader.GetString(0), reader.GetString(1)), (FileFactKind)reader.GetInt32(2), reader.GetInt32(3));break;
            }
        }
        if (job is null) { transaction.Commit(); return null; }
        var source = (await FileFactDatabase.CaptureAsync(connection, transaction, job.Identity, token))!;
        var leaseId = Guid.NewGuid().ToString("N");
        var expires = checked(now + leaseMilliseconds);
        using var update = connection.CreateCommand();
        update.Transaction = transaction;
        update.CommandText = """
            UPDATE file_fact_jobs SET state = 'leased', lease_id = $lease, lease_expires = $expires,
                policy_epoch = $policy, size_bytes = $size, modified_file_time = $modified,
                volume_epoch = $epoch, content_revision = $revision
            WHERE volume_id = $volume AND file_reference = $reference AND kind = $kind AND extractor_version = $extractor;
            """;
        BindJob(update, job, source);
        update.Parameters.AddWithValue("$lease", leaseId);
        update.Parameters.AddWithValue("$expires", expires);
        update.Parameters.AddWithValue("$policy", epoch);
        await update.ExecuteNonQueryAsync(token);
        transaction.Commit();
        return new(leaseId, job, source, expires);
    }

    public async Task<bool> RenewAsync(string leaseId, int leaseMilliseconds = 30_000, CancellationToken token = default)
    {
        ValidateDuration(leaseMilliseconds);
        await using var connection = await OpenAsync(token);
        return await FileFactLeaseRenewal.RenewAsync(connection, leaseId, clock.GetUtcNow().ToUnixTimeMilliseconds(), leaseMilliseconds, token);
    }

    public async Task<FileFactCompletion> CompleteAsync(string leaseId, FileFactObservation observation,
        CancellationToken token = default)
    {
        ArgumentNullException.ThrowIfNull(observation);
        FileFactDatabase.ValidateIdentity(observation.Identity);
        await using var connection = await OpenAsync(token);
        using var transaction = connection.BeginTransaction(deferred: false);
        var (policy, epoch) = await ReadPolicyAsync(connection, transaction, token);
        using var check = connection.CreateCommand();
        check.Transaction = transaction;
        var scope = await FileFactEntryPolicy.BindAsync(check, policy, token);
        check.CommandText = $"""
            SELECT EXISTS(SELECT 1 FROM file_fact_jobs j JOIN catalog_nodes_v2 n
                ON n.volume_id = j.volume_id AND n.file_reference = j.file_reference
                WHERE j.lease_id = $lease AND j.state = 'leased' AND j.lease_expires > $now
                AND j.policy_epoch = $policy AND j.volume_id = $volume AND j.file_reference = $reference
                AND j.kind = $kind AND j.extractor_version = $extractor AND j.size_bytes = $size
                AND j.modified_file_time = $modified AND j.volume_epoch = $epoch AND j.content_revision = $revision
                AND {scope});
            """;
        BindJob(check, new(observation.Identity, observation.Kind, observation.ExtractorVersion), observation.Source);
        check.Parameters.AddWithValue("$lease", leaseId);
        check.Parameters.AddWithValue("$now", clock.GetUtcNow().ToUnixTimeMilliseconds());
        check.Parameters.AddWithValue("$policy", epoch);
        if (Convert.ToInt32(await check.ExecuteScalarAsync(token)) == 0) return FileFactCompletion.LeaseLost;
        var result = await FileFactDatabase.PublishAsync(connection, transaction, observation, token);
        using var finish = connection.CreateCommand();
        finish.Transaction = transaction;
        finish.CommandText = """
            UPDATE file_fact_jobs SET state = $state, lease_id = NULL, lease_expires = NULL, policy_epoch = NULL
                WHERE lease_id = $lease;
            """;
        finish.Parameters.AddWithValue("$state", result == FileFactPublishResult.SourceChanged ? "pending" : "done");
        finish.Parameters.AddWithValue("$lease", leaseId);
        await finish.ExecuteNonQueryAsync(token);
        transaction.Commit();
        return result switch
        {
            FileFactPublishResult.Published => FileFactCompletion.Published,
            FileFactPublishResult.SourceChanged => FileFactCompletion.SourceChanged,
            _ => FileFactCompletion.ExtractorSuperseded
        };
    }

    private async Task<SqliteConnection> OpenAsync(CancellationToken token)
    {
        var connection = await facts.OpenAsync(false, token);
        try { await FileFactQueueSchema.ValidateAsync(connection, token); return connection; }
        catch { await connection.DisposeAsync(); throw; }
    }

    internal static async Task<(FileFactQueuePolicy, long)> ReadPolicyAsync(
        SqliteConnection connection, SqliteTransaction transaction, CancellationToken token)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT policy_json, policy_epoch FROM file_fact_queue_state WHERE singleton = 1;";
        using var reader = await command.ExecuteReaderAsync(token);
        if (!await reader.ReadAsync(token)) throw new CatalogSchemaException("Missing extraction policy.");
        var policy = JsonSerializer.Deserialize<FileFactQueuePolicy>(reader.GetString(0))
            ?? throw new CatalogSchemaException("Invalid extraction policy.");
        _ = FileFactQueueScope.Serialize(policy);
        return (policy, reader.GetInt64(1));
    }

    private static void BindJob(SqliteCommand command, FileFactJob job, FileFactSourceVersion source)
    {
        ArgumentNullException.ThrowIfNull(source);
        FileFactDatabase.BindIdentity(command, job.Identity);
        command.Parameters.AddWithValue("$kind", (int)job.Kind);
        command.Parameters.AddWithValue("$extractor", job.ExtractorVersion);
        command.Parameters.AddWithValue("$size", source.SizeBytes);
        command.Parameters.AddWithValue("$modified", source.ModifiedFileTime);
        command.Parameters.AddWithValue("$epoch", source.VolumeEpoch);
        command.Parameters.AddWithValue("$revision", source.ContentRevision);
    }

    private static void ValidateDuration(int milliseconds)
    {
        if (milliseconds is < 1_000 or > 60_000) throw new ArgumentOutOfRangeException(nameof(milliseconds));
    }
}
