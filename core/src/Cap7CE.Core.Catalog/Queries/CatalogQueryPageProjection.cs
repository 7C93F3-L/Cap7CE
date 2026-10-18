namespace Cap7CE.Core.Catalog.Queries;

internal static class CatalogQueryPageProjection
{
    public static string Sql(bool entries)
    {
        var name = entries ? "m.name" : "n.name";
        var parent = entries ? "CASE WHEN m.entry_key='' THEN n.parent_file_reference ELSE e.parent_file_reference END" : "n.parent_file_reference";
        var extension = entries ? "CASE WHEN m.entry_key='' THEN n.extension ELSE e.extension END" : "n.extension";
        var key = entries ? "m.entry_key" : "''";
        var entryJoin = entries ? "LEFT JOIN catalog_file_entries e ON e.volume_id=n.volume_id AND e.file_reference=n.file_reference AND e.entry_key=m.entry_key" : "";
        return $"""
            SELECT n.volume_id,n.file_reference,{name},
                CASE WHEN n.is_directory=1 THEN COALESCE(dp.relative_path,{name})
                    WHEN pp.relative_path IS NULL OR pp.relative_path='' THEN {name}
                    ELSE pp.relative_path || '\' || {name} END AS relative_path,
                {extension},n.is_directory,n.attributes,n.size_bytes,n.created_utc_ticks,n.modified_utc_ticks,{key}
            FROM matched_keys m JOIN catalog_nodes_v2 n ON n.volume_id=m.volume_id AND n.file_reference=m.file_reference
            {entryJoin}
            LEFT JOIN catalog_directory_paths_v2 dp ON dp.volume_id=n.volume_id AND dp.file_reference=n.file_reference
            LEFT JOIN catalog_directory_paths_v2 pp ON pp.volume_id=n.volume_id AND pp.file_reference=({parent})
            """;
    }
}
