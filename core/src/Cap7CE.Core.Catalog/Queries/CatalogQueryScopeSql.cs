using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.Queries;

internal static class CatalogQueryScopeSql
{
    public static void Append(StringBuilder sql, SqliteCommand command, CatalogQueryScope scope, bool entries)
    {
        var source = entries ? "query_entries" : "catalog_nodes_v2";
        var key = entries ? "entry_key" : "''";
        switch (scope.Kind) {
            case CatalogQueryScopeKind.AllVolumes:
                sql.Append("SELECT NULL,NULL,NULL WHERE 0"); break;
            case CatalogQueryScopeKind.DirectChildren:
            case CatalogQueryScopeKind.DirectoryDescendants:
                sql.Append($"SELECT volume_id,file_reference,{key} FROM {source} WHERE volume_id=$scopeVolume AND parent_file_reference=$scopeRoot AND file_reference<>$scopeRoot AND exists_flag=1");
                command.Parameters.AddWithValue("$scopeVolume", scope.VolumeId!);
                command.Parameters.AddWithValue("$scopeRoot", scope.RootFileReference!);
                if (scope.Kind == CatalogQueryScopeKind.DirectoryDescendants) AppendDescendants();
                break;
            case CatalogQueryScopeKind.SavedScope:
                sql.Append($"SELECT child.volume_id,child.file_reference,{(entries ? "child.entry_key" : "''")} FROM {source} child JOIN catalog_saved_scopes_v2 saved ON saved.scope_id=$scopeId AND child.volume_id=saved.volume_id AND child.parent_file_reference=saved.root_file_reference WHERE child.exists_flag=1 AND child.file_reference<>saved.root_file_reference");
                command.Parameters.AddWithValue("$scopeId", scope.SavedScopeId!); AppendDescendants(); break;
            default: throw new ArgumentOutOfRangeException(nameof(scope));
        }
        void AppendDescendants() => sql.Append($" UNION SELECT child.volume_id,child.file_reference,{(entries ? "child.entry_key" : "''")} FROM {source} child JOIN scope_nodes parent ON child.volume_id=parent.volume_id AND child.parent_file_reference=parent.file_reference WHERE child.exists_flag=1");
    }
}
