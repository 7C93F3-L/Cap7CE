using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog;

// Called before upsert in the owning transaction. Directory attribute/time
// updates cannot change paths; structural changes retain the existing rebuild.
internal static class CatalogDirectoryPathChanges
{
    public static async Task<bool> RequiresRebuildAsync(SqliteConnection connection,
        SqliteTransaction transaction, IReadOnlyList<CatalogV2NodeRecord> nodes, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.CommandText = """
            SELECT parent_file_reference,name,is_directory,exists_flag FROM catalog_nodes_v2
            WHERE volume_id=$volume AND file_reference=$reference;
            """;
        var volume = command.Parameters.Add("$volume", SqliteType.Text);
        var reference = command.Parameters.Add("$reference", SqliteType.Text);
        foreach (var node in nodes.Where(node => node.IsDirectory))
        {
            token.ThrowIfCancellationRequested();
            volume.Value = node.Identity.VolumeId;
            reference.Value = node.Identity.FileReference.ToUpperInvariant();
            using var reader = await command.ExecuteReaderAsync(token);
            if (!await reader.ReadAsync(token) || reader.GetInt32(2) != 1
                || (reader.GetInt32(3) == 1) != node.Exists
                || !string.Equals(reader.GetString(1), node.Name, StringComparison.Ordinal)
                || !string.Equals(reader.IsDBNull(0) ? null : reader.GetString(0),
                    node.ParentFileReference?.ToUpperInvariant(), StringComparison.Ordinal)) return true;
        }
        return false;
    }
}
