namespace Cap7CE.Core.Catalog.Queries;

internal static class CatalogEntryScopedSource
{
    // scope_nodes already validated complete sets and live parents in this read
    // snapshot. Resolve each physical identity and optional entry by primary key.
    public const string Cte = """
        scoped_entries AS NOT MATERIALIZED (
            SELECT physical.volume_id,physical.file_reference,
                CASE WHEN sk.entry_key='' THEN physical.parent_file_reference ELSE e.parent_file_reference END AS parent_file_reference,
                CASE WHEN sk.entry_key='' THEN physical.name ELSE e.name END AS name,
                CASE WHEN sk.entry_key='' THEN physical.extension ELSE e.extension END AS extension,
                physical.is_directory,physical.attributes,physical.exists_flag,physical.size_bytes,
                physical.created_utc_ticks,physical.modified_utc_ticks,sk.entry_key
            FROM scope_nodes sk CROSS JOIN catalog_nodes_v2 physical
            LEFT JOIN catalog_file_entries e ON e.volume_id=sk.volume_id AND e.file_reference=sk.file_reference AND e.entry_key=sk.entry_key
            WHERE physical.volume_id=sk.volume_id AND physical.file_reference=sk.file_reference
        ),
        """;
}
