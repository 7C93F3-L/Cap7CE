namespace Cap7CE.Core.Catalog.Queries;

// MFT enumeration can omit record 5 (the NTFS root). Its children still carry
// the complete root reference, including the sequence number; never invent it.
public static class CatalogVolumeRootResolver
{
    public static async Task<CatalogResolvedDirectory?> ResolveAsync(
        CatalogV2Database catalog, string volumeId, CancellationToken token)
    {
        var explicitRoot = await catalog.ResolveDirectoryAsync(volumeId, string.Empty, token);
        if (explicitRoot is not null) return explicitRoot;
        await using var connection = await catalog.OpenAsync(true, token);
        return await CatalogQueryExecution.RunAsync<CatalogResolvedDirectory?>(connection, token, async () => {
            using var command = connection.CreateCommand();
            command.CommandText = """
                SELECT DISTINCT n.parent_file_reference
                FROM catalog_nodes_v2 n JOIN catalog_volumes_v2 v USING(volume_id)
                WHERE n.volume_id=$volume AND v.file_system='NTFS' COLLATE NOCASE
                  AND n.exists_flag=1 AND length(n.parent_file_reference)=16
                  AND substr(n.parent_file_reference,5)='000000000005'
                LIMIT 2;
                """;
            command.Parameters.AddWithValue("$volume", volumeId);
            using var reader = await command.ExecuteReaderAsync(token);
            if (!await reader.ReadAsync(token)) return null;
            var reference = reader.GetString(0);
            if (await reader.ReadAsync(token)) return null; // Mixed sequences are ambiguous.
            CatalogV2Database.ValidateIdentity(new(volumeId, reference));
            return new CatalogResolvedDirectory(new(volumeId, reference), string.Empty);
        });
    }
}
