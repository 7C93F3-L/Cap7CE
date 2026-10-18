using Cap7CE.Core.Catalog.DirectoryEntries;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

// A content job belongs to the physical file: any known excluded name blocks it.
// Includes choose at least one permitted name; they never cancel an exclusion.
internal static class FileFactEntryPolicy
{
    public static Task<bool> IsActiveAsync(SqliteConnection connection, SqliteTransaction transaction, CancellationToken token) =>
        CatalogEntryQuerySource.IsActiveAsync(connection, transaction, token);
    public static string Prefix(bool active) => active ? "WITH " + CatalogEntryQuerySource.Cte.TrimEnd(',', '\r', '\n', ' ') + " " : "";
    public static async Task<string> BindAsync(SqliteCommand command, FileFactQueuePolicy policy, CancellationToken token) =>
        "(" + Bind(command, policy, await IsActiveAsync(command.Connection!, command.Transaction!, token)) + ") AND "
        + await CatalogFileEntryPending.ExclusionSqlAsync(command.Connection!, command.Transaction, token);
    public static string Bind(SqliteCommand command, FileFactQueuePolicy policy, bool active)
    {
        if (!active) return FileFactQueueScope.Bind(command, policy);
        var include = FileFactQueueScope.Bind(command, policy with { Excludes = [] }, "entry", "entryInclude");
        var exclude = FileFactQueueScope.Bind(command, policy with { Includes = policy.Excludes, Excludes = [] }, "excluded", "entryExclude");
        return $"""
            EXISTS({Eligible}
                SELECT 1 FROM eligible entry WHERE {include}
                    AND NOT EXISTS(SELECT 1 FROM eligible excluded WHERE {exclude}))
            """;
    }
    internal const string Eligible = """
            WITH eligible AS MATERIALIZED (
                SELECT n.volume_id,n.file_reference,n.parent_file_reference,n.extension
                WHERE NOT EXISTS(SELECT 1 FROM catalog_file_entry_sets s WHERE s.volume_id=n.volume_id
                    AND s.file_reference=n.file_reference AND s.created_utc_ticks IS n.created_utc_ticks)
                UNION ALL
                SELECT n.volume_id,n.file_reference,e.parent_file_reference,e.extension FROM catalog_file_entries e
                JOIN catalog_file_entry_sets s ON s.volume_id=e.volume_id AND s.file_reference=e.file_reference
                JOIN catalog_nodes_v2 p ON p.volume_id=e.volume_id AND p.file_reference=e.parent_file_reference AND p.is_directory=1 AND p.exists_flag=1
                JOIN catalog_directory_paths_v2 pp ON pp.volume_id=e.volume_id AND pp.file_reference=e.parent_file_reference
                WHERE e.volume_id=n.volume_id AND e.file_reference=n.file_reference AND s.created_utc_ticks IS n.created_utc_ticks)
            """;
}
