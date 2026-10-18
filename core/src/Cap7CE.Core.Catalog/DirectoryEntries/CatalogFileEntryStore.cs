using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.DirectoryEntries;

// Explicitly activated extension. Physical identity/facts/keywords remain owned by
// Catalog; a complete set describes the names of one file, never duplicate files.
public sealed class CatalogFileEntryStore(CatalogV2Database catalog)
{
    public async Task InitializeAsync(CancellationToken token = default)
    {
        await using var connection = await catalog.OpenAsync(false, token);
        await CatalogFileEntrySchema.InitializeAsync(connection, token);
    }

    public async Task<CatalogFileEntrySet?> ReadAsync(CatalogEntryIdentity identity, CancellationToken token = default)
    {
        CatalogV2Database.ValidateIdentity(identity);
        await using var connection = await catalog.OpenAsync(true, token);
        if (!await CatalogFileEntrySchema.ExistsAsync(connection, token)) return null;
        using var transaction = connection.BeginTransaction(deferred: true);
        return await ReadAsync(connection, transaction, identity, token);
    }

    public async Task<bool> ReplaceAsync(CatalogEntryIdentity identity, CatalogFileEntrySource source,
        long expectedVolumeRevision, IReadOnlyList<CatalogFileName> names, CancellationToken token = default)
    {
        var entries = CatalogFileEntryRules.Normalize(identity, names);
        ArgumentNullException.ThrowIfNull(source);
        if (expectedVolumeRevision < 0) throw new ArgumentOutOfRangeException(nameof(expectedVolumeRevision));
        await using var connection = await catalog.OpenAsync(false, token);
        if (!await CatalogFileEntrySchema.ExistsAsync(connection, token)) throw new InvalidOperationException("File entries were not activated.");
        using var transaction = connection.BeginTransaction();
        using var command = connection.CreateCommand(); command.Transaction = transaction;
        Bind(command, identity);
        command.Parameters.AddWithValue("$revision", expectedVolumeRevision);
        command.Parameters.AddWithValue("$created", (object?)source.CreatedUtcTicks ?? DBNull.Value);
        command.Parameters.AddWithValue("$modified", (object?)source.ModifiedUtcTicks ?? DBNull.Value);
        command.Parameters.AddWithValue("$size", (object?)source.SizeBytes ?? DBNull.Value);
        command.CommandText = """
            SELECT EXISTS(SELECT 1 FROM catalog_nodes_v2 n JOIN catalog_volumes_v2 v ON n.volume_id=v.volume_id
            WHERE n.volume_id=$volume AND n.file_reference=$reference AND n.is_directory=0 AND n.exists_flag=1
              AND n.created_utc_ticks IS $created AND n.modified_utc_ticks IS $modified AND n.size_bytes IS $size
              AND v.selected=1 AND v.state='ready' AND v.catalog_revision=$revision);
            """;
        if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) != 1)
            throw new CatalogConcurrencyException("File entry source or volume changed.");
        command.CommandText = "SELECT EXISTS(SELECT 1 FROM catalog_nodes_v2 WHERE volume_id=$volume AND file_reference=$parent AND is_directory=1 AND exists_flag=1);";
        var parent = command.Parameters.Add("$parent", SqliteType.Text);
        foreach (var entry in entries) {
            parent.Value = entry.ParentFileReference;
            if (Convert.ToInt32(await command.ExecuteScalarAsync(token)) != 1)
                throw new CatalogConcurrencyException("File entry parent is unavailable.");
        }
        var previous = await ReadAsync(connection, transaction, identity, token);
        if (previous is not null && previous.CreatedUtcTicks == source.CreatedUtcTicks && previous.Entries.SequenceEqual(entries)) return false;
        command.CommandText = "DELETE FROM catalog_file_entry_sets WHERE volume_id=$volume AND file_reference=$reference;";
        await command.ExecuteNonQueryAsync(token);
        command.CommandText = "INSERT INTO catalog_file_entry_sets VALUES($volume,$reference,$created);";
        await command.ExecuteNonQueryAsync(token);
        command.CommandText = "INSERT INTO catalog_file_entries VALUES($volume,$reference,$key,$parent,$name,$extension);";
        var key = command.Parameters.Add("$key", SqliteType.Text); var name = command.Parameters.Add("$name", SqliteType.Text);
        var extension = command.Parameters.Add("$extension", SqliteType.Text);
        foreach (var entry in entries) {
            key.Value = entry.EntryKey; parent.Value = entry.ParentFileReference; name.Value = entry.Name;
            extension.Value = entry.Extension;
            await command.ExecuteNonQueryAsync(token);
        }
        command.CommandText = """
            UPDATE catalog_state_v2 SET catalog_revision=catalog_revision+1 WHERE singleton=1 AND catalog_revision<9223372036854775807;
            """;
        if (await command.ExecuteNonQueryAsync(token) != 1) throw new CatalogConcurrencyException("Catalog revision exhausted.");
        command.CommandText = "UPDATE catalog_volumes_v2 SET catalog_revision=(SELECT catalog_revision FROM catalog_state_v2 WHERE singleton=1) WHERE volume_id=$volume;";
        await command.ExecuteNonQueryAsync(token);
        token.ThrowIfCancellationRequested(); transaction.Commit(); return true;
    }

    private static async Task<CatalogFileEntrySet?> ReadAsync(SqliteConnection connection, SqliteTransaction transaction,
        CatalogEntryIdentity identity, CancellationToken token)
    {
        using var command = connection.CreateCommand(); command.Transaction = transaction; Bind(command, identity);
        command.CommandText = """
            SELECT s.created_utc_ticks,e.entry_key,e.parent_file_reference,e.name,e.extension FROM catalog_file_entry_sets s
            JOIN catalog_nodes_v2 n ON n.volume_id=s.volume_id AND n.file_reference=s.file_reference AND n.created_utc_ticks IS s.created_utc_ticks
            LEFT JOIN catalog_file_entries e ON e.volume_id=s.volume_id AND e.file_reference=s.file_reference
            WHERE s.volume_id=$volume AND s.file_reference=$reference AND n.exists_flag=1
            ORDER BY e.entry_key;
            """;
        using var reader = await command.ExecuteReaderAsync(token);
        if (!await reader.ReadAsync(token)) return null;
        var created = reader.IsDBNull(0) ? (long?)null : reader.GetInt64(0);
        var entries = new List<CatalogFileEntry>();
        do { if (!reader.IsDBNull(1)) entries.Add(new(reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4))); }
        while (await reader.ReadAsync(token));
        return new(identity, created, entries.AsReadOnly());
    }

    private static void Bind(SqliteCommand command, CatalogEntryIdentity identity)
    {
        command.Parameters.AddWithValue("$volume", identity.VolumeId);
        command.Parameters.AddWithValue("$reference", identity.FileReference.ToUpperInvariant());
    }
}
