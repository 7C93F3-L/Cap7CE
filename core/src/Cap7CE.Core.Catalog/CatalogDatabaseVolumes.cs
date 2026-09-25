using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog;

public sealed partial class CatalogDatabase
{
    public async Task<CatalogVolumeSnapshot> RegisterVolumeAsync(
        string volumeId,
        string fileSystem,
        string? journalId,
        CancellationToken cancellationToken = default)
    {
        RequireBoundedText(volumeId, 128, nameof(volumeId));
        RequireBoundedText(fileSystem, 32, nameof(fileSystem));
        if (journalId is not null) RequireBoundedText(journalId, 128, nameof(journalId));

        await using var connection = await OpenAsync(readOnly: false, cancellationToken);
        using var transaction = connection.BeginTransaction();
        var revision = NextRevision(await ReadCatalogRevisionAsync(connection, transaction, cancellationToken));
        using (var command = connection.CreateCommand())
        {
            command.Transaction = transaction;
            command.CommandText = """
                INSERT INTO volumes(volume_id, file_system, journal_id, checkpoint, state, catalog_revision)
                VALUES($volumeId, $fileSystem, $journalId, NULL, 'disabled', $revision);

                UPDATE catalog_state SET catalog_revision = $revision WHERE singleton = 1;
                """;
            command.Parameters.AddWithValue("$volumeId", volumeId);
            command.Parameters.AddWithValue("$fileSystem", fileSystem);
            command.Parameters.AddWithValue("$journalId", (object?)journalId ?? DBNull.Value);
            command.Parameters.AddWithValue("$revision", revision);
            try
            {
                await command.ExecuteNonQueryAsync(cancellationToken);
            }
            catch (SqliteException error) when (error.SqliteErrorCode == 19)
            {
                throw new CatalogConcurrencyException("Catalog volume is already registered.", error);
            }
        }
        await RefreshAvailabilityAsync(connection, transaction, cancellationToken);
        transaction.Commit();
        return new CatalogVolumeSnapshot(volumeId, fileSystem, journalId, null, CatalogVolumeState.Disabled, revision);
    }

    public async Task<CatalogVolumeSnapshot?> ReadVolumeAsync(
        string volumeId,
        CancellationToken cancellationToken = default)
    {
        RequireBoundedText(volumeId, 128, nameof(volumeId));
        await using var connection = await OpenAsync(readOnly: true, cancellationToken);
        return await ReadVolumeAsync(connection, null, volumeId, cancellationToken);
    }

    public async Task<CatalogVolumeSnapshot> TransitionVolumeAsync(
        string volumeId,
        CatalogVolumeState expectedState,
        CatalogVolumeState nextState,
        CancellationToken cancellationToken = default)
    {
        RequireBoundedText(volumeId, 128, nameof(volumeId));
        if (!CatalogVolumeStateMachine.CanTransition(expectedState, nextState))
        {
            throw new CatalogStateTransitionException($"Catalog volume cannot transition from {expectedState} to {nextState}.");
        }

        await using var connection = await OpenAsync(readOnly: false, cancellationToken);
        using var transaction = connection.BeginTransaction();
        var volume = await ReadVolumeAsync(connection, transaction, volumeId, cancellationToken)
            ?? throw new CatalogConcurrencyException("Catalog volume is not registered.");
        if (volume.State != expectedState)
        {
            throw new CatalogConcurrencyException("Catalog volume state changed before the transition was committed.");
        }
        if (expectedState == nextState) return volume;

        var revision = NextRevision(await ReadCatalogRevisionAsync(connection, transaction, cancellationToken));
        using (var command = connection.CreateCommand())
        {
            command.Transaction = transaction;
            command.CommandText = """
                UPDATE volumes
                SET state = $nextState, catalog_revision = $revision
                WHERE volume_id = $volumeId AND state = $expectedState;

                UPDATE catalog_state SET catalog_revision = $revision WHERE singleton = 1;
                """;
            command.Parameters.AddWithValue("$nextState", CatalogVolumeStateMachine.ToStorage(nextState));
            command.Parameters.AddWithValue("$revision", revision);
            command.Parameters.AddWithValue("$volumeId", volumeId);
            command.Parameters.AddWithValue("$expectedState", CatalogVolumeStateMachine.ToStorage(expectedState));
            if (await command.ExecuteNonQueryAsync(cancellationToken) != 2)
            {
                throw new CatalogConcurrencyException("Catalog volume transition was not committed atomically.");
            }
        }
        await RefreshAvailabilityAsync(connection, transaction, cancellationToken);
        transaction.Commit();
        return volume with { State = nextState, CatalogRevision = revision };
    }
}
