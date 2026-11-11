using Microsoft.Data.Sqlite;
namespace Cap7CE.Core.Catalog;
public sealed partial class CatalogV2Database
{
    // Preflight the entire bounded leaf batch in the owning transaction before writing any paths.
    private static async Task<bool> TryUpdateLeafDirectoryPathAsync(SqliteConnection connection,
        SqliteTransaction transaction, CatalogEntryIdentity identity, CancellationToken token, bool validateOnly, ISet<string> changed)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        command.Parameters.AddWithValue("$volume", identity.VolumeId);
        command.Parameters.AddWithValue("$reference", identity.FileReference);
        command.CommandText = """
            SELECT n.exists_flag,n.is_directory,n.parent_file_reference,n.name,p.relative_path,
                EXISTS(SELECT 1 FROM catalog_nodes_v2 child WHERE child.volume_id=n.volume_id
                    AND child.parent_file_reference=n.file_reference AND child.exists_flag=1 AND child.is_directory=1)
            FROM catalog_nodes_v2 n
            LEFT JOIN catalog_nodes_v2 parent ON parent.volume_id=n.volume_id
                AND parent.file_reference=n.parent_file_reference AND parent.exists_flag=1 AND parent.is_directory=1
            LEFT JOIN catalog_directory_paths_v2 p ON p.volume_id=parent.volume_id AND p.file_reference=parent.file_reference
            WHERE n.volume_id=$volume AND n.file_reference=$reference;
            """;
        string? path = null;
        using (var reader = await command.ExecuteReaderAsync(token)) {
            if (!await reader.ReadAsync(token) || reader.GetInt32(1) != 1 || reader.GetInt32(5) != 0) return false;
            if (reader.IsDBNull(2) || string.Equals(reader.GetString(2), identity.FileReference, StringComparison.Ordinal)) return false;
            if (changed.Contains(reader.GetString(2))) return false;
            if (reader.GetInt32(0) == 1) {
                if (reader.IsDBNull(4)) return false;
                var parent = reader.GetString(4); var name = reader.GetString(3);
                path = parent.Length == 0 ? NormalizeRootDirectoryName(name) : parent + "\\" + name;
                if (path.Length > 32767) throw new CatalogSchemaException("Catalog v2 directory path exceeds the Windows path limit.");
            }
        }
        if (validateOnly) return true;
        token.ThrowIfCancellationRequested();
        command.CommandText = path is null
            ? "DELETE FROM catalog_directory_paths_v2 WHERE volume_id=$volume AND file_reference=$reference;"
            : """
                INSERT INTO catalog_directory_paths_v2(volume_id,file_reference,relative_path) VALUES($volume,$reference,$path)
                ON CONFLICT(volume_id,file_reference) DO UPDATE SET relative_path=excluded.relative_path;
                """;
        if (path is not null) command.Parameters.AddWithValue("$path", path);
        await command.ExecuteNonQueryAsync(token);
        return true;
    }
    private static async Task<bool> TryUpdateLeafDirectoryPathsAsync(SqliteConnection connection, SqliteTransaction transaction, IReadOnlyList<CatalogEntryIdentity> changes, CancellationToken token)
    {
        if (changes.Count > CatalogDirectoryPathChanges.MaximumLocalChanges) return false;
        var changed = changes.Select(identity => identity.FileReference).ToHashSet(StringComparer.Ordinal);
        foreach (var identity in changes) if (!await TryUpdateLeafDirectoryPathAsync(connection, transaction, identity, token, true, changed)) return false;
        foreach (var identity in changes) if (!await TryUpdateLeafDirectoryPathAsync(connection, transaction, identity, token, false, changed)) throw new CatalogConcurrencyException("Leaf batch validation changed.");
        return true;
    }
}
