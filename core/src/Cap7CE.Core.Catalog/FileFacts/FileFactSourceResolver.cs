using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

public sealed record FileFactResolvedSource(
    CatalogEntryIdentity Identity, string RootPath, string RelativePath, string FullPath, FileFactSourceVersion Source);

// Resolves only Catalog-owned local paths; physical identity must still be verified by the worker.
public sealed class FileFactSourceResolver(string databasePath)
{
    private readonly FileFactDatabase facts = new(databasePath);

    public async Task<FileFactResolvedSource?> ResolveAsync(CatalogEntryIdentity identity, CancellationToken token = default)
    {
        FileFactDatabase.ValidateIdentity(identity);
        await using var connection = await facts.OpenAsync(true, token);
        await FileFactSchema.ValidateAsync(connection, token);
        using var transaction = connection.BeginTransaction(deferred: true);
        var source = await FileFactDatabase.CaptureAsync(connection, transaction, identity, token);
        if (source is null) return null;
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            SELECT v.display_name,
                CASE WHEN pp.relative_path IS NULL OR pp.relative_path = '' THEN n.name
                    ELSE pp.relative_path || '\' || n.name END
            FROM catalog_nodes_v2 n JOIN catalog_volumes_v2 v ON v.volume_id = n.volume_id
            LEFT JOIN catalog_directory_paths_v2 pp
                ON pp.volume_id = n.volume_id AND pp.file_reference = n.parent_file_reference
            WHERE n.volume_id = $volume AND n.file_reference = $reference
                AND (n.parent_file_reference IS NULL OR pp.file_reference IS NOT NULL);
            """;
        FileFactDatabase.BindIdentity(command, identity);
        using var reader = await command.ExecuteReaderAsync(token);
        if (!await reader.ReadAsync(token)) return null;
        var display = reader.GetString(0);
        var relative = reader.GetString(1);
        if (display.Length != 2 || !char.IsAsciiLetter(display[0]) || display[1] != ':'
            || string.IsNullOrEmpty(relative) || relative.Length > 32760
            || relative.IndexOfAny(['\0', ':', '/', '?', '*', '<', '>', '|', '"']) >= 0
            || relative.Split('\\').Any(segment => segment.Length == 0 || segment is "." or "..")) return null;
        var root = char.ToUpperInvariant(display[0]) + ":\\";
        return new(identity with { FileReference = identity.FileReference.ToUpperInvariant() }, root, relative, root + relative, source);
    }
}
