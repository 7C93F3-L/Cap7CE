namespace Cap7CE.Core.Catalog;

public sealed partial class CatalogDatabase
{
    public async Task<IReadOnlyList<CatalogNodeRecord>> ReadNodesPageAsync(
        string volumeId,
        long? afterFileReference,
        int limit,
        CancellationToken cancellationToken = default)
    {
        RequireBoundedText(volumeId, 128, nameof(volumeId));
        if (afterFileReference < 0) throw new ArgumentOutOfRangeException(nameof(afterFileReference));
        if (limit is < 1 or > MaximumReadPage) throw new ArgumentOutOfRangeException(nameof(limit));

        await using var connection = await OpenAsync(readOnly: true, cancellationToken);
        var volume = await ReadVolumeAsync(connection, null, volumeId, cancellationToken)
            ?? throw new CatalogConcurrencyException("Catalog volume is not registered.");
        if (volume.State is not (CatalogVolumeState.Ready or CatalogVolumeState.CatchingUp))
        {
            throw new CatalogNotQueryableException("Catalog volume is not queryable.");
        }

        using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT volume_id, file_reference, parent_reference, name, extension,
                   is_directory, attributes, exists_flag, size_bytes, modified_utc_ticks
            FROM nodes
            WHERE volume_id = $volumeId AND exists_flag = 1
              AND ($after IS NULL OR file_reference > $after)
            ORDER BY file_reference
            LIMIT $limit;
            """;
        command.Parameters.AddWithValue("$volumeId", volumeId);
        command.Parameters.AddWithValue("$after", (object?)afterFileReference ?? DBNull.Value);
        command.Parameters.AddWithValue("$limit", limit);
        var nodes = new List<CatalogNodeRecord>(limit);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            nodes.Add(new CatalogNodeRecord(
                reader.GetString(0),
                reader.GetInt64(1),
                reader.IsDBNull(2) ? null : reader.GetInt64(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetInt32(5) != 0,
                reader.GetInt64(6),
                reader.GetInt32(7) != 0,
                reader.IsDBNull(8) ? null : reader.GetInt64(8),
                reader.IsDBNull(9) ? null : reader.GetInt64(9)));
        }
        return nodes;
    }

    public async Task<long> CountNodesAsync(
        string volumeId,
        CancellationToken cancellationToken = default)
    {
        RequireBoundedText(volumeId, 128, nameof(volumeId));
        await using var connection = await OpenAsync(readOnly: true, cancellationToken);
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM nodes WHERE volume_id = $volumeId;";
        command.Parameters.AddWithValue("$volumeId", volumeId);
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));
    }

    public async Task<IReadOnlyList<CatalogNodeRecord>> SearchNodesByNameAsync(
        string volumeId,
        string query,
        int limit,
        CancellationToken cancellationToken = default)
    {
        RequireBoundedText(volumeId, 128, nameof(volumeId));
        RequireBoundedText(query, 256, nameof(query));
        ValidateReadLimit(limit);
        return await SearchNodesAsync(
            volumeId,
            "name LIKE $value ESCAPE '\\' COLLATE NOCASE",
            $"%{EscapeLikePattern(query)}%",
            limit,
            cancellationToken);
    }

    public async Task<IReadOnlyList<CatalogNodeRecord>> SearchNodesByExtensionAsync(
        string volumeId,
        string extension,
        int limit,
        CancellationToken cancellationToken = default)
    {
        RequireBoundedText(volumeId, 128, nameof(volumeId));
        RequireBoundedText(extension, 64, nameof(extension));
        ValidateReadLimit(limit);
        return await SearchNodesAsync(
            volumeId,
            "extension = $value COLLATE NOCASE",
            extension,
            limit,
            cancellationToken);
    }

    private async Task<IReadOnlyList<CatalogNodeRecord>> SearchNodesAsync(
        string volumeId,
        string predicate,
        string value,
        int limit,
        CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(readOnly: true, cancellationToken);
        var volume = await ReadVolumeAsync(connection, null, volumeId, cancellationToken)
            ?? throw new CatalogConcurrencyException("Catalog volume is not registered.");
        if (volume.State is not (CatalogVolumeState.Ready or CatalogVolumeState.CatchingUp))
        {
            throw new CatalogNotQueryableException("Catalog volume is not queryable.");
        }

        using var command = connection.CreateCommand();
        command.CommandText = $"""
            SELECT volume_id, file_reference, parent_reference, name, extension,
                   is_directory, attributes, exists_flag, size_bytes, modified_utc_ticks
            FROM nodes
            WHERE volume_id = $volumeId AND exists_flag = 1 AND {predicate}
            ORDER BY file_reference
            LIMIT $limit;
            """;
        command.Parameters.AddWithValue("$volumeId", volumeId);
        command.Parameters.AddWithValue("$value", value);
        command.Parameters.AddWithValue("$limit", limit);
        var nodes = new List<CatalogNodeRecord>(limit);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            nodes.Add(new CatalogNodeRecord(
                reader.GetString(0), reader.GetInt64(1), reader.IsDBNull(2) ? null : reader.GetInt64(2),
                reader.GetString(3), reader.GetString(4), reader.GetInt32(5) != 0, reader.GetInt64(6),
                reader.GetInt32(7) != 0, reader.IsDBNull(8) ? null : reader.GetInt64(8),
                reader.IsDBNull(9) ? null : reader.GetInt64(9)));
        }
        return nodes;
    }

    private static void ValidateReadLimit(int limit)
    {
        if (limit is < 1 or > MaximumReadPage) throw new ArgumentOutOfRangeException(nameof(limit));
    }

    private static string EscapeLikePattern(string value) =>
        value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);
}
