using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog.Queries;

// Read-only, deterministic identity ordering. No source file reads, persisted
// random columns, schema migration or result-wide Renderer materialization.
internal static class CatalogRandomOrdering
{
    public static void Configure(SqliteConnection connection, CatalogV2Query query)
    {
        if (query.RandomSeed is null) return;
        connection.CreateFunction<string, string, long, long>("catalog_random_score",
            (volume, reference, seed) => Score(volume, reference, checked((uint)seed)), isDeterministic: true);
    }

    public static string Expression(string alias) => $"catalog_random_score({alias}.volume_id, {alias}.file_reference, $randomSeed)";

    public static long Score(string volume, string reference, uint seed)
    {
        unchecked {
            var hash = 14695981039346656037UL ^ seed;
            foreach (var value in volume) hash = (hash ^ value) * 1099511628211UL;
            hash = (hash ^ '/') * 1099511628211UL;
            foreach (var value in reference) hash = (hash ^ value) * 1099511628211UL;
            hash = (hash ^ (hash >> 30)) * 0xbf58476d1ce4e5b9UL;
            hash = (hash ^ (hash >> 27)) * 0x94d049bb133111ebUL;
            return (long)((hash ^ (hash >> 31)) & 0x7fffffffffffffffUL);
        }
    }
}
