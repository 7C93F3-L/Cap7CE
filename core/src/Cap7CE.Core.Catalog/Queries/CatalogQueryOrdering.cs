using System.Text;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog;

public enum CatalogQuerySort { NameAscending, NameDescending, ModifiedAscending, ModifiedDescending }

internal static class CatalogQueryOrdering
{
    private static string NameCollation(CatalogV2Query query)=>query.Scope.Kind==CatalogQueryScopeKind.DirectChildren?"CAP7CE_NATURAL":"NOCASE";
    public static string Order(CatalogV2Query query, string alias, bool entries = false)
    {
        var name = $"{alias}.name COLLATE {NameCollation(query)}";
        var identity = $"{alias}.volume_id, {alias}.file_reference" + (entries ? $", {alias}.entry_key" : "");
        var order = query.RandomSeed is not null ? $"{Queries.CatalogRandomOrdering.Expression(alias)}, {identity}" : query.Sort switch
        {
            CatalogQuerySort.NameAscending => $"{name}, {identity}",
            CatalogQuerySort.NameDescending => $"{name} DESC, {identity}",
            CatalogQuerySort.ModifiedAscending => $"COALESCE({alias}.modified_utc_ticks, -1), {name}, {identity}",
            CatalogQuerySort.ModifiedDescending => $"COALESCE({alias}.modified_utc_ticks, -1) DESC, {name}, {identity}",
            _ => throw new ArgumentException("Invalid query ordering.")
        };
        return query.Scope.Kind == CatalogQueryScopeKind.DirectChildren ? $"{alias}.is_directory DESC, {order}" : order;
    }

    public static void AppendAfter(StringBuilder sql, SqliteCommand command, CatalogV2Query query, bool entries = false)
    {
        if (query.RandomSeed is { } seed) command.Parameters.AddWithValue("$randomSeed", (long)seed);
        if (query.After is not { } after) return;
        var compare = query.Sort == CatalogQuerySort.NameDescending ? "<" : ">";
        var identity = "(n.volume_id > $afterVolume OR (n.volume_id=$afterVolume AND n.file_reference > $afterReference)"
            + (entries ? " OR (n.volume_id=$afterVolume AND n.file_reference=$afterReference AND n.entry_key > $afterEntry)" : "") + ")";
        var collation=NameCollation(query);
        var name = $"(n.name COLLATE {collation} {compare} $afterName COLLATE {collation} OR (n.name=$afterName COLLATE {collation} AND {identity}))";
        if (query.RandomSeed is { } randomSeed) {
            var score = Queries.CatalogRandomOrdering.Expression("n");
            if (after.RandomScore != Queries.CatalogRandomOrdering.Score(after.VolumeId, after.FileReference, randomSeed)) throw new ArgumentException("Invalid random cursor anchor.");
            name = $"({score} > $afterRandom OR ({score} = $afterRandom AND {identity}))";
            command.Parameters.AddWithValue("$afterRandom", after.RandomScore!.Value);
        }
        else if (query.Sort is CatalogQuerySort.ModifiedAscending or CatalogQuerySort.ModifiedDescending)
        {
            if (after.ModifiedUtcTicks is null) throw new ArgumentException("Missing modified time cursor anchor.");
            compare = query.Sort == CatalogQuerySort.ModifiedDescending ? "<" : ">";
            name = $"(COALESCE(n.modified_utc_ticks, -1) {compare} $afterModified OR (COALESCE(n.modified_utc_ticks, -1) = $afterModified AND {name}))";
            command.Parameters.AddWithValue("$afterModified", after.ModifiedUtcTicks);
        }
        if (query.Scope.Kind == CatalogQueryScopeKind.DirectChildren)
        {
            if (after.IsDirectory is null) throw new ArgumentException("Missing directory cursor anchor.");
            name = $"(n.is_directory < $afterDirectory OR (n.is_directory = $afterDirectory AND {name}))";
            command.Parameters.AddWithValue("$afterDirectory", after.IsDirectory.Value ? 1 : 0);
        }
        sql.Append(" AND ").Append(name);
        command.Parameters.AddWithValue("$afterName", after.Name);
        command.Parameters.AddWithValue("$afterVolume", after.VolumeId);
        command.Parameters.AddWithValue("$afterReference", after.FileReference);
        if (entries) command.Parameters.AddWithValue("$afterEntry", after.EntryKey ?? "");
    }
}
