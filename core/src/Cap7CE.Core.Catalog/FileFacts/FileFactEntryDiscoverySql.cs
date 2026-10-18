using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.FileFacts;

// Choose a format within the authorized names of this physical identity only.
internal static class FileFactEntryDiscoverySql
{
    public static string Bind(SqliteCommand command, FileFactQueuePolicy policy, FileFactCatalogChange? change, string extensions)
    {
        var scope = FileFactQueueScope.Bind(command, policy, "entry", "discovery");
        var changed = FileFactChangedScope.Bind(command, change, "entry");
        return $"({FileFactEntryPolicy.Eligible} SELECT MIN(entry.extension) FROM eligible entry WHERE entry.extension COLLATE NOCASE IN ({extensions}) AND {scope} AND {changed})";
    }
}
