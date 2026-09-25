namespace Cap7CE.Core.Catalog;

public sealed partial class CatalogDatabase
{
    public async Task<CatalogVolumeSnapshot> ReconcileVolumeAsync(
        CatalogVolumeObservation observation,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(observation);
        RequireBoundedText(observation.VolumeId, 128, nameof(observation.VolumeId));
        if (observation.IsOnline)
        {
            RequireBoundedText(observation.JournalId ?? string.Empty, 128, nameof(observation.JournalId));
        }

        var volume = await ReadVolumeAsync(observation.VolumeId, cancellationToken)
            ?? throw new CatalogConcurrencyException("Catalog volume is not registered.");
        if (!observation.IsOnline)
        {
            return volume.State switch
            {
                CatalogVolumeState.Ready or CatalogVolumeState.CatchingUp =>
                    await TransitionVolumeAsync(
                        volume.VolumeId, volume.State, CatalogVolumeState.Offline, cancellationToken),
                CatalogVolumeState.Offline => volume,
                _ => throw new CatalogStateTransitionException(
                    $"Catalog volume cannot become offline from {volume.State}.")
            };
        }
        if (volume.State == CatalogVolumeState.NeedsRebuild) return volume;
        if (volume.State is not (CatalogVolumeState.Ready
            or CatalogVolumeState.CatchingUp
            or CatalogVolumeState.Offline
            or CatalogVolumeState.Degraded))
        {
            throw new CatalogStateTransitionException(
                $"Catalog volume continuity cannot be reconciled from {volume.State}.");
        }

        var continuous = string.Equals(volume.JournalId, observation.JournalId, StringComparison.Ordinal)
            && (volume.Checkpoint is null || observation.StoredCheckpointContinuous);
        var nextState = continuous ? CatalogVolumeState.CatchingUp : CatalogVolumeState.NeedsRebuild;
        return volume.State == nextState
            ? volume
            : await TransitionVolumeAsync(volume.VolumeId, volume.State, nextState, cancellationToken);
    }

    public async Task<CatalogVolumeSnapshot> BeginRebuildAsync(
        string volumeId,
        string journalId,
        string snapshotId,
        CancellationToken cancellationToken = default)
    {
        RequireBoundedText(volumeId, 128, nameof(volumeId));
        RequireBoundedText(journalId, 128, nameof(journalId));
        RequireBoundedText(snapshotId, 128, nameof(snapshotId));
        await using var connection = await OpenAsync(readOnly: false, cancellationToken);
        using var transaction = connection.BeginTransaction();
        var volume = await ReadVolumeAsync(connection, transaction, volumeId, cancellationToken)
            ?? throw new CatalogConcurrencyException("Catalog volume is not registered.");
        if (volume.State != CatalogVolumeState.NeedsRebuild)
        {
            throw new CatalogStateTransitionException("Catalog volume is not waiting for a rebuild.");
        }

        var revision = NextRevision(await ReadCatalogRevisionAsync(connection, transaction, cancellationToken));
        using (var updateVolume = connection.CreateCommand())
        {
            updateVolume.Transaction = transaction;
            updateVolume.CommandText = """
                UPDATE volumes
                SET journal_id = $journalId,
                    checkpoint = NULL,
                    state = 'building',
                    catalog_revision = $revision
                WHERE volume_id = $volumeId AND state = 'needsRebuild';
                """;
            updateVolume.Parameters.AddWithValue("$volumeId", volumeId);
            updateVolume.Parameters.AddWithValue("$journalId", journalId);
            updateVolume.Parameters.AddWithValue("$revision", revision);
            if (await updateVolume.ExecuteNonQueryAsync(cancellationToken) != 1)
            {
                throw new CatalogConcurrencyException("Catalog volume rebuild state changed before commit.");
            }
        }
        using (var deleteNodes = connection.CreateCommand())
        {
            deleteNodes.Transaction = transaction;
            deleteNodes.CommandText = "DELETE FROM nodes WHERE volume_id = $volumeId;";
            deleteNodes.Parameters.AddWithValue("$volumeId", volumeId);
            await deleteNodes.ExecuteNonQueryAsync(cancellationToken);
        }
        using (var updateState = connection.CreateCommand())
        {
            updateState.Transaction = transaction;
            updateState.CommandText = """
                UPDATE catalog_state
                SET catalog_revision = $revision,
                    committed_snapshot_id = $snapshotId
                WHERE singleton = 1;
                """;
            updateState.Parameters.AddWithValue("$revision", revision);
            updateState.Parameters.AddWithValue("$snapshotId", snapshotId);
            if (await updateState.ExecuteNonQueryAsync(cancellationToken) != 1)
            {
                throw new CatalogSchemaException("Catalog state is missing.");
            }
        }
        await RefreshAvailabilityAsync(connection, transaction, cancellationToken);
        transaction.Commit();
        return volume with
        {
            JournalId = journalId,
            Checkpoint = null,
            State = CatalogVolumeState.Building,
            CatalogRevision = revision
        };
    }
}
