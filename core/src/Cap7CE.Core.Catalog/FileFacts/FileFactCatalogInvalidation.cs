using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

// Optional extension: legacy Catalogs have no fact tables and keep their existing behavior.
// Fences commit in the same transaction as the base change, never after it.
internal static class FileFactCatalogInvalidation
{
    public static async Task ApplyNodesAsync(SqliteConnection connection, SqliteTransaction transaction,
        IReadOnlyList<CatalogV2NodeRecord> nodes, CancellationToken token)
    {
        var identities = nodes.Where(node => node.InvalidatesFileFacts || !node.Exists)
            .Select(node => node.Identity).ToHashSet();
        var renamed = nodes.Where(node => node.MayChangeFileFormat && node.Exists && !node.IsDirectory).ToArray();
        if (identities.Count == 0 && renamed.Length == 0 || !await IsEnabledAsync(connection, transaction, token)) return;
        // Only USN rename candidates need a lookup. Initial MFT snapshots and
        // ordinary data-change batches do not perform per-node format queries.
        using (var previous = connection.CreateCommand()) {
            previous.Transaction = transaction;
            previous.CommandText = "SELECT extension FROM catalog_nodes_v2 WHERE volume_id=$volume AND file_reference=$reference;";
            var previousVolume = previous.Parameters.Add("$volume", SqliteType.Text);
            var previousReference = previous.Parameters.Add("$reference", SqliteType.Text);
            foreach (var node in renamed) {
                if (identities.Contains(node.Identity)) continue;
                previousVolume.Value = node.Identity.VolumeId;
                previousReference.Value = node.Identity.FileReference.ToUpperInvariant();
                if (await previous.ExecuteScalarAsync(token) is string extension
                    && !string.Equals(extension, node.Extension, StringComparison.OrdinalIgnoreCase)) identities.Add(node.Identity);
            }
        }
        if (identities.Count == 0) return;
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO file_fact_sources VALUES($volume, $reference, 1)
            ON CONFLICT(volume_id, file_reference) DO UPDATE SET content_revision = content_revision + 1;
            """;
        var volume = command.Parameters.Add("$volume", SqliteType.Text);
        var reference = command.Parameters.Add("$reference", SqliteType.Text);
        foreach (var identity in identities)
        {
            volume.Value = identity.VolumeId;
            reference.Value = identity.FileReference.ToUpperInvariant();
            await command.ExecuteNonQueryAsync(token);
        }
        command.CommandText = "UPDATE file_fact_state SET fact_revision = fact_revision + 1 WHERE singleton = 1;";
        await command.ExecuteNonQueryAsync(token);
    }

    public static async Task ApplyVolumeAsync(SqliteConnection connection, SqliteTransaction transaction,
        string volumeId, CancellationToken token)
    {
        if (!await IsEnabledAsync(connection, transaction, token)) return;
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO file_fact_volumes VALUES($volume, 1)
            ON CONFLICT(volume_id) DO UPDATE SET epoch = epoch + 1;
            """;
        command.Parameters.AddWithValue("$volume", volumeId);
        await command.ExecuteNonQueryAsync(token);
        command.CommandText = "UPDATE file_fact_state SET fact_revision = fact_revision + 1 WHERE singleton = 1;";
        await command.ExecuteNonQueryAsync(token);
        await FileFactChangeLog.RecordVolumeAsync(connection, transaction, volumeId, token);
    }

    internal static async Task<bool> IsEnabledAsync(SqliteConnection connection, SqliteTransaction transaction,
        CancellationToken token)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name = 'file_fact_state');";
        if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) == 0) return false;
        command.CommandText = "SELECT schema_version FROM file_fact_state WHERE singleton = 1;";
        if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) != FileFactSchema.Version)
            throw new CatalogSchemaException("File fact schema cannot accept Catalog changes.");
        return true;
    }
}
