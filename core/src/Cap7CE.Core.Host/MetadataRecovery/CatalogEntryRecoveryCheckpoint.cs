using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Host.MetadataRecovery;

internal sealed record CatalogEntryRecoveryPoint(string Path, long Revision);

// Catalog-only recovery metadata. No directory discovery or asset-file access.
internal static class CatalogEntryRecoveryCheckpoint
{
    public static async Task<CatalogEntryRecoveryPoint> CreateAsync(string path, string directory,
        string prefix, bool expectedEntryMode, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var enabled = await new CatalogFileEntryActivation(new(path)).ReadEnabledAsync(token);
        if (enabled != expectedEntryMode) throw new InvalidDataException("Unexpected recovery Catalog mode.");
        await using var source = new SqliteConnection(new SqliteConnectionStringBuilder {
            DataSource = path, Mode = SqliteOpenMode.ReadOnly, Pooling = false }.ToString());
        await source.OpenAsync(token);
        using var snapshot = source.BeginTransaction(deferred: true);
        using var stamp = source.CreateCommand(); stamp.Transaction = snapshot;
        stamp.CommandText = "PRAGMA user_version;";
        if (Convert.ToInt32(await stamp.ExecuteScalarAsync(token)) != (expectedEntryMode ? 3 : 2))
            throw new CatalogConcurrencyException("Catalog storage changed before its recovery snapshot.");
        stamp.CommandText = "SELECT catalog_revision FROM catalog_state_v2 WHERE singleton=1;";
        var revision = Convert.ToInt64(await stamp.ExecuteScalarAsync(token));
        var output = await CatalogRecoverySnapshotWriter.WriteAsync(source, directory, prefix, token);
        return new(output, revision);
    }
}
