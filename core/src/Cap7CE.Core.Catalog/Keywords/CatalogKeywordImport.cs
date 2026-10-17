using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.Keywords;

public sealed partial class CatalogKeywordStore
{
    public async Task<CatalogKeywordImportResult> ImportAsync(IReadOnlyList<CatalogLegacyKeywords> entries, CancellationToken token = default)
    {
        if (entries is null || entries.Count > 64) throw new ArgumentException("Invalid legacy keyword batch.");
        var normalized = entries.Select(entry => entry is null || string.IsNullOrWhiteSpace(entry.Path) || entry.Path.Length > 32767
            || entry.Path.Contains('\0') || entry.CreatedFileTimeMilliseconds is null
            || entry.Path.Length < 4 || !char.IsAsciiLetter(entry.Path[0]) || entry.Path[1] != ':' || entry.Path[2] != '\\'
            || !long.TryParse(entry.CreatedFileTimeMilliseconds, out var created) || created < 0
            ? throw new ArgumentException("Invalid legacy keyword entry.") : Normalize(entry.Keywords)).ToArray();
        await using var connection = await OpenAsync(false, token);
        using var transaction = connection.BeginTransaction();
        var revision = await RevisionAsync(connection, transaction, token);
        var imported = 0;
        for (var index = 0; index < entries.Count; index++)
        {
            var entry = entries[index];
            using var command = connection.CreateCommand(); command.Transaction = transaction;
            command.CommandText = """
                SELECT n.volume_id, n.file_reference, COALESCE(CAST(n.created_utc_ticks AS TEXT), '')
                FROM catalog_nodes_v2 n JOIN catalog_volumes_v2 v ON v.volume_id=n.volume_id
                LEFT JOIN catalog_directory_paths_v2 p ON p.volume_id=n.volume_id AND p.file_reference=n.parent_file_reference
                WHERE n.exists_flag=1 AND n.is_directory=0 AND v.selected=1 AND v.state IN ('ready','catchingUp')
                  AND v.display_name=$drive COLLATE NOCASE AND n.name=$name COLLATE NOCASE
                  AND (v.display_name || '\' || CASE WHEN COALESCE(p.relative_path,'')='' THEN n.name
                    ELSE p.relative_path || '\' || n.name END) = $path COLLATE NOCASE
                  AND CAST(n.created_utc_ticks/10000 AS TEXT)=$created LIMIT 1;
                """;
            command.Parameters.AddWithValue("$path", entry.Path); command.Parameters.AddWithValue("$created", entry.CreatedFileTimeMilliseconds);
            command.Parameters.AddWithValue("$drive", entry.Path[..2]); command.Parameters.AddWithValue("$name", entry.Path[(entry.Path.LastIndexOf('\\') + 1)..]);
            CatalogKeywordIdentity identity; string created;
            await using (var reader = await command.ExecuteReaderAsync(token))
            {
                if (!await reader.ReadAsync(token)) continue;
                identity = new(reader.GetString(0), reader.GetString(1), entry.CreatedFileTimeMilliseconds); created = reader.GetString(2);
            }
            // An explicit empty value is a tombstone and must never resurrect legacy tags.
            if ((await ReadAsync(connection, transaction, identity, created, token)).Revision is not null) continue;
            if (normalized[index].Length == 0) continue;
            await PutAsync(connection, transaction, identity, created, normalized[index], checked(revision + 1), token); imported++;
        }
        if (imported > 0) { revision = checked(revision + 1); await SetRevisionAsync(connection, transaction, revision, token); }
        transaction.Commit(); return new(imported, revision);
    }
}
