using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.DirectoryEntries;

internal static class CatalogFileEntryReadiness
{
    public static async Task<string> PredicateAsync(SqliteConnection connection, SqliteTransaction? transaction, CancellationToken token)
    {
        var pending = await CatalogFileEntryPending.ExclusionSqlAsync(connection, transaction, token);
        if (!await CatalogFileEntryMode.ReadAsync(connection, transaction, token)) return pending;
        return pending + " AND EXISTS(SELECT 1 FROM catalog_file_entry_sets ready_entries WHERE ready_entries.volume_id=n.volume_id AND ready_entries.file_reference=n.file_reference AND ready_entries.created_utc_ticks IS n.created_utc_ticks)";
    }
}
