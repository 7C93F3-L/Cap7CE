using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog;

public sealed partial class CatalogV2Database
{
    public Task<CatalogV2VolumeSnapshot> ApplyBatchAsync(CatalogV2WriteBatch batch, CancellationToken token = default)
        => ApplyBatchCoreAsync(batch, false, token);

    // An external event publishes its checkpoint and any staged owned directory
    // ancestry atomically, without readiness-state writes around each page.
    public Task<CatalogV2VolumeSnapshot> ApplyMaintenanceBatchAsync(CatalogV2WriteBatch batch, CancellationToken token = default)
        => ApplyBatchCoreAsync(batch, true, token);
    public Task<CatalogV2VolumeSnapshot> ApplyEntryRetryBatchAsync(CatalogV2WriteBatch batch, CancellationToken token = default)
        => batch.EntryRetryAtUnixMilliseconds is >= 0 && batch.NextCheckpointUsn == batch.ExpectedCheckpointUsn && batch.FileEntries is not null
            ? ApplyBatchCoreAsync(batch, true, token, true) : throw new ArgumentException("Invalid entry retry transaction.");

    private async Task<CatalogV2VolumeSnapshot> ApplyBatchCoreAsync(
        CatalogV2WriteBatch batch,
        bool maintenance,
        CancellationToken token, bool entryRetry = false)
    {
        ValidateBatch(batch);
        if (maintenance && ((!batch.Nodes.Any(node => !node.SuppressFileFactChangeHint) && batch.DeferredEntries is not { Count: > 0 })
            || batch.ExpectedCheckpointUsn is not { } expected || (!entryRetry && batch.NextCheckpointUsn <= expected)))
            throw new ArgumentException("Maintenance requires an external change and an advancing durable checkpoint.", nameof(batch));
        await using var connection = await OpenAsync(false, token);
        using var transaction = connection.BeginTransaction();
        var volume = await ReadVolumeAsync(connection, transaction, batch.VolumeId, token)
            ?? throw new CatalogConcurrencyException("Catalog volume is not registered.");
        var revision = await ReadRevisionAsync(connection, transaction, token);
        if (revision != batch.ExpectedCatalogRevision
            || !string.Equals(volume.JournalId, batch.ExpectedJournalId, StringComparison.Ordinal)
            || volume.CheckpointUsn != batch.ExpectedCheckpointUsn)
        {
            throw new CatalogConcurrencyException("Catalog v2 batch is stale.");
        }
        if (maintenance ? volume.State != CatalogV2VolumeState.Ready
            : volume.State is not (CatalogV2VolumeState.Building or CatalogV2VolumeState.CatchingUp))
        {
            throw new CatalogStateTransitionException("Catalog v2 accepts batches only while synchronizing.");
        }

        batch = batch with { Nodes = await DirectoryEntries.CatalogFileEntryPendingPublication.MergeInvalidationsAsync(connection, transaction, batch, token) };
        var pathsChanged = (maintenance || volume.State == CatalogV2VolumeState.CatchingUp)
            && await CatalogDirectoryPathChanges.RequiresRebuildAsync(connection, transaction, batch.Nodes, token);
        await FileFacts.FileFactCatalogInvalidation.ApplyNodesAsync(connection, transaction, batch.Nodes, token);
        await UpsertNodesAsync(connection, transaction, "catalog_nodes_v2", batch.Nodes, token);
        await DirectoryEntries.CatalogFileEntryPublication.ApplyAsync(connection, transaction, batch, token);
        await DirectoryEntries.CatalogFileEntryPendingPublication.ApplyAsync(connection, transaction, batch, token);
        if (maintenance || volume.State == CatalogV2VolumeState.CatchingUp)
            await FileFacts.FileFactChangeLog.RecordAsync(connection, transaction, batch.Nodes, token);
        if (pathsChanged)
        {
            await RebuildDirectoryPathsAsync(connection, transaction, batch.VolumeId, token);
        }
        var nextRevision = entryRetry && batch.Nodes.Count == 0 ? revision : NextRevision(revision);
        using (var update = connection.CreateCommand())
        {
            update.Transaction = transaction;
            update.CommandText = """
                UPDATE catalog_volumes_v2
                SET checkpoint_usn = $checkpoint, journal_first_usn = $first,
                    journal_lowest_valid_usn = $lowest, processed = processed + $count,
                    catalog_revision = $revision
                WHERE volume_id = $volume;
                """;
            update.Parameters.AddWithValue("$checkpoint", batch.NextCheckpointUsn);
            update.Parameters.AddWithValue("$first", (object?)batch.JournalFirstUsn ?? DBNull.Value);
            update.Parameters.AddWithValue("$lowest", (object?)batch.JournalLowestValidUsn ?? DBNull.Value);
            update.Parameters.AddWithValue("$count", batch.Nodes.Count);
            update.Parameters.AddWithValue("$revision", nextRevision);
            update.Parameters.AddWithValue("$volume", batch.VolumeId);
            await update.ExecuteNonQueryAsync(token);
        }
        await SetRevisionAsync(connection, transaction, nextRevision, token);
        token.ThrowIfCancellationRequested(); transaction.Commit();
        return (await ReadVolumeAsync(batch.VolumeId, token))!;
    }

}
