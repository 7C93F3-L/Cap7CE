using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.Queries;

// A first plain term selects a conservative set of entry keys. The original
// complete text predicate still verifies every term in the same read snapshot.
internal static class CatalogTextCandidateSql
{
    public static bool UseScopedSource(CatalogV2Query query) => query.Scope.Kind != CatalogQueryScopeKind.AllVolumes || FirstTerm(query) is not null;

    public static void AppendScope(StringBuilder sql, SqliteCommand command, CatalogV2Query query, bool entries)
    {
        if (!entries || FirstTerm(query) is not { } term) { CatalogQueryScopeSql.Append(sql, command, query.Scope, entries); return; }
        command.Parameters.AddWithValue("$candidateTerm", Pattern(term));
        sql.Append("WITH text_candidates(volume_id,file_reference,entry_key) AS MATERIALIZED (");
        sql.Append("SELECT n.volume_id,n.file_reference,'' FROM catalog_nodes_v2 n WHERE n.exists_flag=1 AND (");
        sql.Append(Match("n", query.TextTarget, true));
        sql.Append("""
            ) AND (n.is_directory=1 OR NOT EXISTS(SELECT 1 FROM catalog_file_entry_sets s
                WHERE s.volume_id=n.volume_id AND s.file_reference=n.file_reference AND s.created_utc_ticks IS n.created_utc_ticks))
            UNION ALL SELECT e.volume_id,e.file_reference,e.entry_key FROM catalog_file_entries e WHERE (
            """);
        sql.Append(Match("e", query.TextTarget, false));
        sql.Append("""
            )) SELECT k.volume_id,k.file_reference,k.entry_key FROM text_candidates k
            CROSS JOIN catalog_nodes_v2 n ON n.volume_id=k.volume_id AND n.file_reference=k.file_reference
            LEFT JOIN catalog_file_entry_sets s ON s.volume_id=k.volume_id AND s.file_reference=k.file_reference
            LEFT JOIN catalog_file_entries e ON e.volume_id=k.volume_id AND e.file_reference=k.file_reference AND e.entry_key=k.entry_key
            LEFT JOIN catalog_nodes_v2 p ON p.volume_id=e.volume_id AND p.file_reference=e.parent_file_reference
            LEFT JOIN catalog_directory_paths_v2 pp ON pp.volume_id=e.volume_id AND pp.file_reference=e.parent_file_reference
            WHERE n.exists_flag=1 AND (k.entry_key='' OR (n.is_directory=0 AND e.entry_key IS NOT NULL
                AND n.created_utc_ticks IS s.created_utc_ticks AND p.exists_flag=1 AND p.is_directory=1 AND pp.file_reference IS NOT NULL))
            """);
    }

    private static string? FirstTerm(CatalogV2Query query)
    {
        if (query.Scope.Kind != CatalogQueryScopeKind.AllVolumes || query.Facts is not null || query.TextTarget == CatalogQueryTextTarget.Name) return null;
        var term = query.Query.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault();
        return term is not null && !term.Contains('\\') ? term : null;
    }

    private static string Match(string alias, CatalogQueryTextTarget target, bool physical)
    {
        var sql = $"{alias}.name LIKE $candidateTerm ESCAPE '\\' COLLATE NOCASE";
        if (target != CatalogQueryTextTarget.Name) {
            var parent = physical ? "CASE WHEN n.is_directory=1 THEN n.file_reference ELSE n.parent_file_reference END" : "e.parent_file_reference";
            sql += $"""
                 OR {alias}.volume_id IN (SELECT volume_id FROM catalog_volumes_v2 WHERE display_name LIKE $candidateTerm ESCAPE '\' COLLATE NOCASE)
                 OR ({alias}.volume_id,{parent}) IN (SELECT volume_id,file_reference FROM catalog_directory_paths_v2 WHERE relative_path LIKE $candidateTerm ESCAPE '\' COLLATE NOCASE)
                """;
        }
        if (target == CatalogQueryTextTarget.NamePathOrKeywords) sql += $"""
             OR ({alias}.volume_id,{alias}.file_reference) IN (SELECT volume_id,file_reference FROM catalog_manual_keywords WHERE search_text LIKE $candidateTerm ESCAPE '\' COLLATE NOCASE)
            """;
        if (target == CatalogQueryTextTarget.NamePathOrKeywords) sql += $" OR ({alias}.volume_id,{alias}.file_reference) IN (SELECT volume_id,file_reference FROM catalog_embedded_search WHERE search_text LIKE $candidateTerm ESCAPE '\\' COLLATE NOCASE)";
        return sql;
    }
    public static string Pattern(string value) => "%" + value.Replace("\\", "\\\\", StringComparison.Ordinal)
        .Replace("%", "\\%", StringComparison.Ordinal).Replace("_", "\\_", StringComparison.Ordinal) + "%";
}
