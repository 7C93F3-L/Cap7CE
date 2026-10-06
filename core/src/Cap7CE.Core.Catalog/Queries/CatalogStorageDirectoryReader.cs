using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.Queries;

public sealed record CatalogStorageDirectoryLink(string FileReference, string? ParentFileReference);
public sealed record CatalogStorageDirectoryPage(IReadOnlyList<CatalogStorageDirectoryLink> Directories, string? Next);
public sealed record CatalogStorageParent(string? ParentFileReference, bool IsDirectory, bool Exists);

// Read-only identity ancestry for owned-storage filtering; no facts activation,
// paths or directory enumeration. A revision change rejects a mixed snapshot.
public sealed class CatalogStorageDirectoryReader(CatalogV2Database catalog)
{
    public const int MaximumOwnedDirectories = 65_536;
    public Task<CatalogStorageDirectoryPage> ReadOwnedPageAsync(string volumeId, IReadOnlyList<string> roots,
        long expectedRevision, string? after = null, int pageSize = 512, CancellationToken token = default)
    {
        ValidateReferences(volumeId, roots, 32);
        var copiedRoots = roots.ToArray();
        if (roots.Count == 0 || pageSize is < 1 or > 512) throw new ArgumentException("Invalid owned directory page.");
        if (after is not null) CatalogV2Database.ValidateIdentity(new(volumeId, after));
        return ReadSnapshotAsync(volumeId, expectedRevision, async (connection, transaction) => {
            using var command = connection.CreateCommand(); command.Transaction = transaction;
            var parameters = BindReferences(command, copiedRoots); command.Parameters.AddWithValue("$volume", volumeId);
            command.Parameters.AddWithValue("$after", after?.ToUpperInvariant() ?? ""); command.Parameters.AddWithValue("$limit", pageSize + 1);
            command.CommandText = $"""
                WITH RECURSIVE owned(reference,parent) AS (
                    SELECT file_reference,parent_file_reference FROM catalog_nodes_v2
                        WHERE volume_id=$volume AND file_reference IN ({string.Join(',', parameters)}) AND is_directory=1 AND exists_flag=1
                    UNION
                    SELECT n.file_reference,n.parent_file_reference FROM owned p
                        CROSS JOIN catalog_nodes_v2 n INDEXED BY catalog_nodes_v2_parent ON n.parent_file_reference=p.reference
                        WHERE n.volume_id=$volume AND n.is_directory=1 AND n.exists_flag=1
                    LIMIT 65537
                ), counted AS (SELECT reference,parent,COUNT(*) OVER() AS total FROM owned)
                SELECT reference,parent,total FROM counted WHERE reference > $after ORDER BY reference LIMIT $limit;
                """;
            using var reader = await command.ExecuteReaderAsync(token);
            var links = new List<CatalogStorageDirectoryLink>();
            while (await reader.ReadAsync(token)) {
                if (reader.GetInt64(2) > MaximumOwnedDirectories) throw new InvalidDataException("owned-directory-index-too-large");
                links.Add(new(reader.GetString(0), reader.IsDBNull(1) ? null : reader.GetString(1)));
            }
            string? next = null;
            if (links.Count > pageSize) { links.RemoveAt(links.Count - 1); next = links[^1].FileReference; }
            return new CatalogStorageDirectoryPage(links, next);
        }, token);
    }

    public Task<IReadOnlyDictionary<string, CatalogStorageParent>> ReadParentsAsync(string volumeId, IReadOnlyList<string> references,
        long expectedRevision, CancellationToken token = default)
    {
        ValidateReferences(volumeId, references, 4096);
        var copiedReferences = references.ToArray();
        return ReadSnapshotAsync<IReadOnlyDictionary<string, CatalogStorageParent>>(volumeId, expectedRevision, async (connection, transaction) => {
            var parents = new Dictionary<string, CatalogStorageParent>(StringComparer.OrdinalIgnoreCase);
            if (copiedReferences.Length == 0) return parents;
            using var command = connection.CreateCommand(); command.Transaction = transaction;
            var parameters = BindReferences(command, copiedReferences); command.Parameters.AddWithValue("$volume", volumeId);
            command.CommandText = $"SELECT file_reference,parent_file_reference,is_directory,exists_flag FROM catalog_nodes_v2 WHERE volume_id=$volume AND file_reference IN ({string.Join(',', parameters)});";
            using var reader = await command.ExecuteReaderAsync(token);
            while (await reader.ReadAsync(token)) parents.Add(reader.GetString(0), new(reader.IsDBNull(1) ? null : reader.GetString(1), reader.GetInt32(2) == 1, reader.GetInt32(3) == 1));
            return parents;
        }, token);
    }
    private async Task<T> ReadSnapshotAsync<T>(string volumeId, long expectedRevision,
        Func<SqliteConnection, SqliteTransaction, Task<T>> read, CancellationToken token)
    {
        if (expectedRevision < 0) throw new ArgumentException("Invalid Catalog revision.");
        await using var connection = await catalog.OpenAsync(true, token);
        await CatalogV2Schema.ValidateAsync(connection, token);
        return await CatalogQueryExecution.RunAsync(connection, token, async () => {
            using var transaction = connection.BeginTransaction(deferred: true);
            using var command = connection.CreateCommand(); command.Transaction = transaction;
            command.CommandText = "SELECT EXISTS(SELECT 1 FROM catalog_state_v2 s JOIN catalog_volumes_v2 v ON v.volume_id=$volume WHERE s.singleton=1 AND s.catalog_revision=$revision AND v.selected=1 AND v.state='ready');";
            command.Parameters.AddWithValue("$volume", volumeId); command.Parameters.AddWithValue("$revision", expectedRevision);
            if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) != 1) throw new CatalogConcurrencyException("Owned ancestry Catalog snapshot changed or is not ready.");
            return await read(connection, transaction);
        });
    }
    private static void ValidateReferences(string volumeId, IReadOnlyList<string> references, int maximum)
    {
        ArgumentNullException.ThrowIfNull(references);
        CatalogV2Database.ValidateIdentity(new(volumeId, "0000000000000000"));
        if (references.Count > maximum) throw new ArgumentException("Identity lookup is too large.");
        foreach (var reference in references) CatalogV2Database.ValidateIdentity(new(volumeId, reference));
    }
    private static string[] BindReferences(SqliteCommand command, IReadOnlyList<string> references) => references.Distinct(StringComparer.OrdinalIgnoreCase)
        .Select((reference, index) => { var name = "$ref" + index; command.Parameters.AddWithValue(name, reference.ToUpperInvariant()); return name; }).ToArray();
}
