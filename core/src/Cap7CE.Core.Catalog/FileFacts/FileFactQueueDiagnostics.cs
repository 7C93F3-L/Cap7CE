using Cap7CE.Core.Catalog.Queries;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

// Counts persisted jobs in the current queryable policy, not full-disk fact coverage.
public sealed record FileFactQueueLedger(long PolicyEpoch, long PendingJobs, long LeasedJobs,
    long CompletedJobs, long? NextLeaseExpiryUnixMilliseconds, IReadOnlyList<string>? UnavailableVolumeIds = null);

public sealed class FileFactQueueDiagnostics(string databasePath, TimeProvider? timeProvider = null)
{
    private readonly FileFactDatabase facts = new(databasePath);
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;

    public async Task<FileFactQueueLedger> ReadAsync(FileFactKind kind, int extractorVersion, CancellationToken token = default, string? volumeId = null)
    {
        if (!Enum.IsDefined(kind) || extractorVersion <= 0) throw new ArgumentException("Invalid queue specification.");
        await using var connection = await facts.OpenAsync(true, token);
        await FileFactQueueSchema.ValidateAsync(connection, token);
        return await CatalogQueryExecution.RunAsync(connection, token, async () =>
        {
            using var transaction = connection.BeginTransaction(deferred: true);
            var (policy, epoch) = await FileFactQueue.ReadPolicyAsync(connection, transaction, token);
            policy = FileFactSelection.ForVolume(policy, volumeId);
            var unavailable = new List<string>();
            foreach (var volume in policy.VolumeOrder.Where(volume => policy.Includes.Any(scope => scope.VolumeId == volume)))
            {
                using var availability = connection.CreateCommand();
                availability.Transaction = transaction;
                availability.CommandText = "SELECT EXISTS(SELECT 1 FROM catalog_volumes_v2 WHERE volume_id = $volume AND selected = 1 AND state = 'ready');";
                availability.Parameters.AddWithValue("$volume", volume);
                if (Convert.ToInt32(await availability.ExecuteScalarAsync(token)) == 0) unavailable.Add(volume);
            }
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            var scope = await FileFactEntryPolicy.BindAsync(command, policy, token);
            command.CommandText = $"""
                SELECT COALESCE(SUM(j.state = 'pending' OR (j.state = 'leased'
                        AND (j.lease_expires <= $now OR j.policy_epoch <> $epoch))), 0),
                    COALESCE(SUM(j.state = 'leased' AND j.lease_expires > $now AND j.policy_epoch = $epoch), 0),
                    COALESCE(SUM(j.state = 'done'), 0),
                    MIN(CASE WHEN j.state = 'leased' AND j.lease_expires > $now AND j.policy_epoch = $epoch
                        THEN j.lease_expires END)
                FROM file_fact_jobs j CROSS JOIN catalog_nodes_v2 n
                    ON n.volume_id = j.volume_id AND n.file_reference = j.file_reference
                JOIN catalog_volumes_v2 v ON v.volume_id = n.volume_id
                WHERE j.kind = $kind AND j.extractor_version = $extractor
                    AND n.exists_flag = 1 AND n.is_directory = 0 AND (n.attributes & 0x00441400) = 0
                    AND v.selected = 1 AND v.state = 'ready' AND {scope};
                """;
            command.Parameters.AddWithValue("$kind", (int)kind);
            command.Parameters.AddWithValue("$extractor", extractorVersion);
            command.Parameters.AddWithValue("$epoch", epoch);
            command.Parameters.AddWithValue("$now", clock.GetUtcNow().ToUnixTimeMilliseconds());
            using var reader = await command.ExecuteReaderAsync(token);
            if (!await reader.ReadAsync(token)) throw new CatalogSchemaException("Missing queue aggregate.");
            return new FileFactQueueLedger(epoch, reader.GetInt64(0), reader.GetInt64(1), reader.GetInt64(2),
                reader.IsDBNull(3) ? null : reader.GetInt64(3), unavailable);
        });
    }
}
