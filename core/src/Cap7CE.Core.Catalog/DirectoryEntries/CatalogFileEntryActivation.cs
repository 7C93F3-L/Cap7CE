using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.DirectoryEntries;

// Explicit maintenance API. Its caller owns a consistent recovery checkpoint
// and retires the active process before upgrading any existing product catalog.
public sealed class CatalogFileEntryActivation(CatalogV2Database catalog)
{
    public async Task<bool> ReadEnabledAsync(CancellationToken token = default)
    {
        await using var connection = await catalog.OpenAsync(true, token);
        await CatalogV2Schema.ValidateAsync(connection, token);
        return await CatalogFileEntryMode.ReadAsync(connection, null, token);
    }
    public async Task<bool> EnablePreparedAsync(long expectedRevision, CancellationToken token = default)
    {
        if (expectedRevision < 0) throw new ArgumentOutOfRangeException(nameof(expectedRevision));
        await using var connection = await catalog.OpenAsync(false, token, requireExisting: true);
        await CatalogV2Schema.ValidateAsync(connection, token);
        using var transaction = connection.BeginTransaction(deferred: false);
        if (await CatalogFileEntryMode.ReadAsync(connection, transaction, token)) return false;
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.CommandText = "SELECT catalog_revision FROM catalog_state_v2 WHERE singleton=1;";
        if (Convert.ToInt64(await command.ExecuteScalarAsync(token)) != expectedRevision) throw new CatalogConcurrencyException("Recovery checkpoint is stale.");
        command.CommandText = "SELECT EXISTS(SELECT 1 FROM catalog_volumes_v2 WHERE state IN ('building','catchingUp'));";
        if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) != 0) throw new CatalogStateTransitionException("Retire Catalog synchronization before activating entries.");
        await CatalogFileEntrySchema.CreateWithinAsync(connection, transaction, token);
        command.Parameters.AddWithValue("$revision", checked(expectedRevision + 1));
        command.CommandText = """
            CREATE TABLE catalog_file_entry_activation (
                singleton INTEGER PRIMARY KEY CHECK(singleton=1),feature_version INTEGER NOT NULL CHECK(feature_version>=1),
                activated_revision INTEGER NOT NULL CHECK(activated_revision>=0)
            ) STRICT;
            INSERT INTO catalog_file_entry_activation VALUES(1,1,$revision);
            UPDATE catalog_volumes_v2 SET state='needsRebuild',catalog_revision=$revision;
            UPDATE catalog_state_v2 SET catalog_revision=$revision WHERE singleton=1;
            PRAGMA user_version=3;
            """;
        await command.ExecuteNonQueryAsync(token);
        token.ThrowIfCancellationRequested(); transaction.Commit(); return true;
    }
    public async Task RequireWriterAsync(bool entryAware, CancellationToken token = default)
    {
        await using var connection = await catalog.OpenAsync(true, token);
        await CatalogFileEntryMode.RequireWriterAsync(connection, null, entryAware, token);
    }
}
