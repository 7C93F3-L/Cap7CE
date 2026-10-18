using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.Queries;

// Directory identities define the walk. Entry keys are selected through parent
// indexes before any page projection; no whole-volume alias materialization.
internal static class CatalogEntryScopeSql
{
    public static void Append(StringBuilder sql, SqliteCommand command, CatalogQueryScope scope)
    {
        if (scope.Kind == CatalogQueryScopeKind.AllVolumes) { sql.Append("SELECT NULL,NULL,NULL WHERE 0"); return; }
        var saved = scope.Kind == CatalogQueryScopeKind.SavedScope;
        if (saved) command.Parameters.AddWithValue("$scopeId", scope.SavedScopeId!);
        else {
            command.Parameters.AddWithValue("$scopeVolume", scope.VolumeId!);
            command.Parameters.AddWithValue("$scopeRoot", scope.RootFileReference!);
        }
        sql.Append("WITH RECURSIVE entry_scope_dirs(volume_id,file_reference) AS (");
        sql.Append(saved ? "SELECT volume_id,root_file_reference FROM catalog_saved_scopes_v2 WHERE scope_id=$scopeId"
            : "SELECT $scopeVolume,$scopeRoot");
        if (scope.Kind != CatalogQueryScopeKind.DirectChildren) sql.Append("""
             UNION SELECT child.volume_id,child.file_reference FROM catalog_nodes_v2 child INDEXED BY catalog_nodes_v2_parent
            JOIN entry_scope_dirs parent ON child.volume_id=parent.volume_id AND child.parent_file_reference=parent.file_reference
            WHERE child.exists_flag=1 AND child.is_directory=1
            """);
        sql.Append("""
            ) SELECT n.volume_id,n.file_reference,'' FROM entry_scope_dirs d
            CROSS JOIN catalog_nodes_v2 n INDEXED BY catalog_nodes_v2_parent ON n.volume_id=d.volume_id AND n.parent_file_reference=d.file_reference
            WHERE n.exists_flag=1 AND n.file_reference<>d.file_reference
                AND (n.is_directory=1 OR NOT EXISTS(SELECT 1 FROM catalog_file_entry_sets s
                    WHERE s.volume_id=n.volume_id AND s.file_reference=n.file_reference AND s.created_utc_ticks IS n.created_utc_ticks))
            UNION ALL
            SELECT e.volume_id,e.file_reference,e.entry_key FROM entry_scope_dirs d
            CROSS JOIN catalog_file_entries e ON e.volume_id=d.volume_id AND e.parent_file_reference=d.file_reference
            JOIN catalog_file_entry_sets s ON s.volume_id=e.volume_id AND s.file_reference=e.file_reference
            JOIN catalog_nodes_v2 n ON n.volume_id=e.volume_id AND n.file_reference=e.file_reference
                AND n.created_utc_ticks IS s.created_utc_ticks AND n.is_directory=0 AND n.exists_flag=1
            JOIN catalog_nodes_v2 p ON p.volume_id=e.volume_id AND p.file_reference=e.parent_file_reference AND p.is_directory=1 AND p.exists_flag=1
            JOIN catalog_directory_paths_v2 pp ON pp.volume_id=e.volume_id AND pp.file_reference=e.parent_file_reference
            """);
    }
}
