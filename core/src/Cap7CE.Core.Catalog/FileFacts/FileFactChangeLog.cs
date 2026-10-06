using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactCatalogChange(long Sequence, CatalogEntryIdentity Identity, bool ScanDescendants);

// Durable identity-only work hints, never file contents. Exact-sequence removal
// prevents acknowledging an older hint from deleting a newer change.
public sealed class FileFactChangeLog(string databasePath)
{
    internal const string CreateTableSql = """
        CREATE TABLE file_fact_catalog_changes (
            sequence INTEGER PRIMARY KEY AUTOINCREMENT,
            volume_id TEXT NOT NULL, file_reference TEXT NOT NULL,
            scan_descendants INTEGER NOT NULL CHECK(scan_descendants IN (0,1)),
            UNIQUE(volume_id, file_reference)
        ) STRICT;
        """;
    private readonly FileFactDatabase facts = new(databasePath);
    internal static async Task RecordAsync(SqliteConnection connection, SqliteTransaction transaction,
        IReadOnlyList<CatalogV2NodeRecord> nodes, CancellationToken token)
    {
        if (nodes.Count == 0 || !await FileFactCatalogInvalidation.IsEnabledAsync(connection, transaction, token)) return;
        using var command = CreateRecorder(connection, transaction);
        foreach (var group in nodes.Where(node => !node.SuppressFileFactChangeHint).GroupBy(node => node.Identity)) {
            Bind(command, group.Key, group.Any(node => node.IsDirectory));
            await command.ExecuteNonQueryAsync(token);
        }
    }
    internal static async Task RecordVolumeAsync(SqliteConnection connection, SqliteTransaction transaction,
        string volumeId, CancellationToken token)
    {
        using var command = CreateRecorder(connection, transaction);
        Bind(command, new(volumeId, "0000000000000000"), true);
        await command.ExecuteNonQueryAsync(token);
    }
    public Task<IReadOnlyList<FileFactCatalogChange>> ReadPageAsync(int pageSize = 128, CancellationToken token = default)
        => ReadAfterAsync(0, pageSize, token);
    public async Task<IReadOnlyList<FileFactCatalogChange>> ReadAfterAsync(long afterSequence, int pageSize = 128, CancellationToken token = default)
    {
        if (afterSequence < 0) throw new ArgumentOutOfRangeException(nameof(afterSequence));
        if (pageSize is < 1 or > 512) throw new ArgumentOutOfRangeException(nameof(pageSize));
        await using var connection = await facts.OpenAsync(true, token);
        await FileFactSchema.ValidateAsync(connection, token);
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT sequence,volume_id,file_reference,scan_descendants FROM file_fact_catalog_changes WHERE sequence > $after ORDER BY sequence LIMIT $limit;";
        command.Parameters.AddWithValue("$after", afterSequence);
        command.Parameters.AddWithValue("$limit", pageSize);
        using var reader = await command.ExecuteReaderAsync(token);
        var changes = new List<FileFactCatalogChange>();
        while (await reader.ReadAsync(token)) changes.Add(new(reader.GetInt64(0), new(reader.GetString(1), reader.GetString(2)), reader.GetInt32(3) == 1));
        return changes;
    }
    public async Task AcknowledgeAsync(IReadOnlyList<FileFactCatalogChange> changes, CancellationToken token = default)
    {
        ArgumentNullException.ThrowIfNull(changes);
        if (changes.Count > 512) throw new ArgumentException("Change acknowledgment batch is too large.");
        foreach (var change in changes) {
            ArgumentNullException.ThrowIfNull(change);
            FileFactDatabase.ValidateIdentity(change.Identity);
            if (change.Sequence < 1) throw new ArgumentException("Invalid change sequence.");
        }
        await using var connection = await facts.OpenAsync(false, token);
        await FileFactSchema.ValidateAsync(connection, token);
        using var transaction = connection.BeginTransaction(deferred: false);
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.CommandText = "DELETE FROM file_fact_catalog_changes WHERE sequence=$sequence AND volume_id=$volume AND file_reference=$reference;";
        var sequence = command.Parameters.Add("$sequence", SqliteType.Integer);
        var volume = command.Parameters.Add("$volume", SqliteType.Text);
        var reference = command.Parameters.Add("$reference", SqliteType.Text);
        foreach (var change in changes) {
            sequence.Value = change.Sequence; volume.Value = change.Identity.VolumeId;
            reference.Value = change.Identity.FileReference.ToUpperInvariant();
            await command.ExecuteNonQueryAsync(token);
        }
        transaction.Commit();
    }
    internal async Task<bool> AcknowledgeIfUnchangedAsync(FileFactCatalogChange change, long volumeRevision, CancellationToken token)
    {
        await using var connection = await facts.OpenAsync(false, token);
        await FileFactSchema.ValidateAsync(connection, token);
        using var transaction = connection.BeginTransaction(deferred: false);
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.CommandText = """
            DELETE FROM file_fact_catalog_changes WHERE sequence=$sequence AND volume_id=$volume AND file_reference=$reference
                AND EXISTS(SELECT 1 FROM catalog_volumes_v2 WHERE volume_id=$volume
                    AND catalog_revision=$revision AND selected=1 AND state='ready');
            """;
        command.Parameters.AddWithValue("$sequence", change.Sequence);
        command.Parameters.AddWithValue("$volume", change.Identity.VolumeId);
        command.Parameters.AddWithValue("$reference", change.Identity.FileReference.ToUpperInvariant());
        command.Parameters.AddWithValue("$revision", volumeRevision);
        var acknowledged = await command.ExecuteNonQueryAsync(token) == 1;
        transaction.Commit(); return acknowledged;
    }
    private static SqliteCommand CreateRecorder(SqliteConnection connection, SqliteTransaction transaction)
    {
        var command = connection.CreateCommand(); command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO file_fact_catalog_changes(volume_id,file_reference,scan_descendants) VALUES($volume,$reference,$descendants)
            ON CONFLICT(volume_id,file_reference) DO UPDATE SET sequence=excluded.sequence,
                scan_descendants=MAX(file_fact_catalog_changes.scan_descendants,excluded.scan_descendants);
            """;
        command.Parameters.Add("$volume", SqliteType.Text); command.Parameters.Add("$reference", SqliteType.Text);
        command.Parameters.Add("$descendants", SqliteType.Integer); return command;
    }
    private static void Bind(SqliteCommand command, CatalogEntryIdentity identity, bool descendants)
    {
        command.Parameters["$volume"].Value = identity.VolumeId;
        command.Parameters["$reference"].Value = identity.FileReference.ToUpperInvariant();
        command.Parameters["$descendants"].Value = descendants ? 1 : 0;
    }
}
