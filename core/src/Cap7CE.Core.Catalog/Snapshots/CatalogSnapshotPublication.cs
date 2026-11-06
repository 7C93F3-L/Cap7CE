using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog;

public sealed partial class CatalogV2Database
{
    internal async Task<CatalogV2VolumeSnapshot> PublishSnapshotBuildAsync(
        string volumeId,
        string snapshotPath,
        long recordCount,
        CancellationToken token, bool captureFileEntries, long expectedVolumeRevision, FileFacts.CatalogFactRecovery? factRecovery = null)
    {
        RequireText(volumeId, 64, nameof(volumeId));
        RequireNonNegative(recordCount, nameof(recordCount));
        await using var connection = await OpenAsync(false, token);
        using (var attach = connection.CreateCommand())
        {
            attach.CommandText = "ATTACH DATABASE $path AS snapshot_build;";
            attach.Parameters.AddWithValue("$path", snapshotPath);
            await attach.ExecuteNonQueryAsync(token);
        }
        if (factRecovery is not null) await factRecovery.AttachAsync(connection, token);
        try
        {
            using var transaction = connection.BeginTransaction();
            await DirectoryEntries.CatalogFileEntryMode.RequireWriterAsync(connection, transaction, captureFileEntries, token);
            var volume = await ReadVolumeAsync(connection, transaction, volumeId, token)
                ?? throw new CatalogConcurrencyException("Catalog volume is not registered.");
            if (volume.State != CatalogV2VolumeState.Building)
            {
                throw new CatalogStateTransitionException("Catalog snapshot can publish only while building.");
            }
            if (volume.CatalogRevision != expectedVolumeRevision) throw new CatalogConcurrencyException("Snapshot build owner changed.");
            if (factRecovery is not null) await factRecovery.RestoreAsync(connection, transaction, volume, token);
            using (var publish = connection.CreateCommand())
            {
                publish.Transaction = transaction;
                publish.CommandText = """
                    INSERT INTO catalog_nodes_v2(
                        volume_id, file_reference, parent_file_reference, name, extension,
                        is_directory, attributes, exists_flag, size_bytes, created_utc_ticks, modified_utc_ticks)
                    SELECT volume_id, file_reference, parent_file_reference, name, extension,
                           is_directory, attributes, exists_flag, size_bytes, created_utc_ticks, modified_utc_ticks
                    FROM snapshot_build.build_nodes WHERE volume_id = $volume
                    ON CONFLICT(volume_id, file_reference) DO UPDATE SET
                        parent_file_reference = excluded.parent_file_reference,
                        name = excluded.name,
                        extension = excluded.extension,
                        is_directory = excluded.is_directory,
                        attributes = excluded.attributes,
                        exists_flag = excluded.exists_flag,
                        size_bytes = excluded.size_bytes,
                        created_utc_ticks = excluded.created_utc_ticks,
                        modified_utc_ticks = excluded.modified_utc_ticks
                    WHERE catalog_nodes_v2.parent_file_reference IS NOT excluded.parent_file_reference OR catalog_nodes_v2.name IS NOT excluded.name
                        OR catalog_nodes_v2.extension IS NOT excluded.extension OR catalog_nodes_v2.is_directory IS NOT excluded.is_directory
                        OR catalog_nodes_v2.attributes IS NOT excluded.attributes OR catalog_nodes_v2.exists_flag IS NOT excluded.exists_flag
                        OR catalog_nodes_v2.size_bytes IS NOT excluded.size_bytes OR catalog_nodes_v2.created_utc_ticks IS NOT excluded.created_utc_ticks
                        OR catalog_nodes_v2.modified_utc_ticks IS NOT excluded.modified_utc_ticks;

                    DELETE FROM catalog_nodes_v2
                    WHERE volume_id = $volume
                      AND NOT EXISTS(
                          SELECT 1 FROM snapshot_build.build_nodes staged
                          WHERE staged.volume_id = catalog_nodes_v2.volume_id
                            AND staged.file_reference = catalog_nodes_v2.file_reference);

                    DELETE FROM catalog_directory_paths_v2 WHERE volume_id = $volume AND NOT EXISTS(SELECT 1 FROM snapshot_build.build_paths p
                        WHERE p.volume_id=catalog_directory_paths_v2.volume_id AND p.file_reference=catalog_directory_paths_v2.file_reference);
                    INSERT INTO catalog_directory_paths_v2(volume_id, file_reference, relative_path)
                    SELECT volume_id, file_reference, relative_path
                    FROM snapshot_build.build_paths WHERE volume_id = $volume
                    ON CONFLICT(volume_id,file_reference) DO UPDATE SET relative_path=excluded.relative_path WHERE catalog_directory_paths_v2.relative_path IS NOT excluded.relative_path;
                    """;
                publish.Parameters.AddWithValue("$volume", volumeId);
                await publish.ExecuteNonQueryAsync(token);
            }
            if (captureFileEntries) await DirectoryEntries.CatalogFileEntryStaging.PublishAsync(connection, transaction, volumeId, token);
            var revision = NextRevision(await ReadRevisionAsync(connection, transaction, token));
            using (var update = connection.CreateCommand())
            {
                update.Transaction = transaction;
                update.CommandText = """
                    UPDATE catalog_volumes_v2
                    SET state = 'ready', processed = $count, total = COALESCE(total, $count),
                        catalog_revision = $revision
                    WHERE volume_id = $volume AND state = 'building';
                    """;
                update.Parameters.AddWithValue("$count", recordCount);
                update.Parameters.AddWithValue("$revision", revision);
                update.Parameters.AddWithValue("$volume", volumeId);
                if (await update.ExecuteNonQueryAsync(token) != 1)
                {
                    throw new CatalogConcurrencyException("Catalog build state changed before publish.");
                }
            }
            await SetRevisionAsync(connection, transaction, revision, token);
            token.ThrowIfCancellationRequested(); transaction.Commit();
        }
        finally
        {
            if (factRecovery is not null) { using var recoveryDetach = connection.CreateCommand(); recoveryDetach.CommandText = "DETACH DATABASE fact_recovery;"; await recoveryDetach.ExecuteNonQueryAsync(CancellationToken.None); }
            using var detach = connection.CreateCommand();
            detach.CommandText = "DETACH DATABASE snapshot_build;";
            await detach.ExecuteNonQueryAsync(CancellationToken.None);
        }
        return (await ReadVolumeAsync(volumeId, token))!;
    }
}
