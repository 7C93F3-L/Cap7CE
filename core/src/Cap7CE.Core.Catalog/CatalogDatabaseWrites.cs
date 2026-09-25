using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog;

public sealed partial class CatalogDatabase
{
    public async Task<CatalogStateSnapshot> ApplyBatchAsync(
        CatalogWriteBatch batch,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(batch);
        RequireBoundedText(batch.VolumeId, 128, nameof(batch.VolumeId));
        RequireBoundedText(batch.NextCheckpoint, 256, nameof(batch.NextCheckpoint));
        RequireBoundedText(batch.SnapshotId, 128, nameof(batch.SnapshotId));
        if (batch.Nodes.Count > MaximumBatchNodes)
        {
            throw new ArgumentOutOfRangeException(nameof(batch), $"A catalog batch may contain at most {MaximumBatchNodes} nodes.");
        }
        foreach (var node in batch.Nodes)
        {
            if (!string.Equals(node.VolumeId, batch.VolumeId, StringComparison.Ordinal))
            {
                throw new ArgumentException("Every catalog node must belong to the batch volume.", nameof(batch));
            }
            if (node.FileReference < 0 || node.ParentReference < 0 || node.Attributes < 0
                || node.SizeBytes < 0 || node.ModifiedUtcTicks < 0)
            {
                throw new ArgumentException("Catalog node numeric values cannot be negative.", nameof(batch));
            }
        }

        await using var connection = await OpenAsync(readOnly: false, cancellationToken);
        using var transaction = connection.BeginTransaction();
        var revision = await ReadCatalogRevisionAsync(connection, transaction, cancellationToken);
        var volume = await ReadVolumeAsync(connection, transaction, batch.VolumeId, cancellationToken)
            ?? throw new CatalogConcurrencyException("Catalog volume is not registered.");
        if (revision != batch.ExpectedCatalogRevision
            || !string.Equals(volume.JournalId, batch.ExpectedJournalId, StringComparison.Ordinal)
            || !string.Equals(volume.Checkpoint, batch.ExpectedCheckpoint, StringComparison.Ordinal))
        {
            throw new CatalogConcurrencyException("Catalog batch is stale.");
        }
        if (volume.State is not (CatalogVolumeState.Building or CatalogVolumeState.CatchingUp))
        {
            throw new CatalogStateTransitionException("Catalog batches are accepted only while building or catching up.");
        }

        foreach (var node in batch.Nodes)
        {
            await UpsertNodeAsync(connection, transaction, node, cancellationToken);
        }

        var nextRevision = NextRevision(revision);
        using (var command = connection.CreateCommand())
        {
            command.Transaction = transaction;
            command.CommandText = """
                UPDATE volumes
                SET checkpoint = $checkpoint, catalog_revision = $revision
                WHERE volume_id = $volumeId;

                UPDATE catalog_state
                SET catalog_revision = $revision, committed_snapshot_id = $snapshotId
                WHERE singleton = 1;
                """;
            command.Parameters.AddWithValue("$checkpoint", batch.NextCheckpoint);
            command.Parameters.AddWithValue("$revision", nextRevision);
            command.Parameters.AddWithValue("$volumeId", batch.VolumeId);
            command.Parameters.AddWithValue("$snapshotId", batch.SnapshotId);
            if (await command.ExecuteNonQueryAsync(cancellationToken) != 2)
            {
                throw new CatalogConcurrencyException("Catalog checkpoint was not committed atomically.");
            }
        }
        await RefreshAvailabilityAsync(connection, transaction, cancellationToken);
        transaction.Commit();
        return await ReadStateAsync(cancellationToken);
    }

    private static async Task UpsertNodeAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        CatalogNodeRecord node,
        CancellationToken cancellationToken)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO nodes(
                volume_id, file_reference, parent_reference, name, extension,
                is_directory, attributes, exists_flag, size_bytes, modified_utc_ticks)
            VALUES(
                $volumeId, $fileReference, $parentReference, $name, $extension,
                $isDirectory, $attributes, $exists, $sizeBytes, $modifiedUtcTicks)
            ON CONFLICT(volume_id, file_reference) DO UPDATE SET
                parent_reference = excluded.parent_reference,
                name = excluded.name,
                extension = excluded.extension,
                is_directory = excluded.is_directory,
                attributes = excluded.attributes,
                exists_flag = excluded.exists_flag,
                size_bytes = excluded.size_bytes,
                modified_utc_ticks = excluded.modified_utc_ticks;
            """;
        command.Parameters.AddWithValue("$volumeId", node.VolumeId);
        command.Parameters.AddWithValue("$fileReference", node.FileReference);
        command.Parameters.AddWithValue("$parentReference", (object?)node.ParentReference ?? DBNull.Value);
        command.Parameters.AddWithValue("$name", node.Name);
        command.Parameters.AddWithValue("$extension", node.Extension);
        command.Parameters.AddWithValue("$isDirectory", node.IsDirectory ? 1 : 0);
        command.Parameters.AddWithValue("$attributes", node.Attributes);
        command.Parameters.AddWithValue("$exists", node.Exists ? 1 : 0);
        command.Parameters.AddWithValue("$sizeBytes", (object?)node.SizeBytes ?? DBNull.Value);
        command.Parameters.AddWithValue("$modifiedUtcTicks", (object?)node.ModifiedUtcTicks ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
