using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

internal static class FileFactLeaseRenewal
{
    public static async Task<bool> RenewAsync(SqliteConnection connection, string lease, long now, int duration, CancellationToken token)
    {
        using var transaction = connection.BeginTransaction(deferred: false);
        var (policy, epoch) = await FileFactQueue.ReadPolicyAsync(connection, transaction, token);
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        var scope = await FileFactEntryPolicy.BindAsync(command, policy, token);
        command.CommandText = $"""
            UPDATE file_fact_jobs AS j SET lease_expires=$expires
            WHERE j.lease_id=$lease AND j.state='leased' AND j.lease_expires>$now AND j.policy_epoch=$policy
                AND EXISTS(SELECT 1 FROM catalog_nodes_v2 n JOIN catalog_volumes_v2 v ON v.volume_id=n.volume_id
                    LEFT JOIN file_fact_volumes fv ON fv.volume_id=n.volume_id
                    LEFT JOIN file_fact_sources fs ON fs.volume_id=n.volume_id AND fs.file_reference=n.file_reference
                    WHERE n.volume_id=j.volume_id AND n.file_reference=j.file_reference
                        AND n.exists_flag=1 AND n.is_directory=0 AND (n.attributes & 0x00441400)=0
                        AND v.selected=1 AND v.state='ready' AND n.size_bytes=j.size_bytes AND n.modified_utc_ticks=j.modified_file_time
                        AND COALESCE(fv.epoch,0)=j.volume_epoch AND COALESCE(fs.content_revision,0)=j.content_revision AND {scope});
            """;
        command.Parameters.AddWithValue("$lease", lease); command.Parameters.AddWithValue("$now", now);
        command.Parameters.AddWithValue("$expires", checked(now + duration)); command.Parameters.AddWithValue("$policy", epoch);
        var changed = await command.ExecuteNonQueryAsync(token) == 1;
        token.ThrowIfCancellationRequested(); transaction.Commit(); return changed;
    }
}
