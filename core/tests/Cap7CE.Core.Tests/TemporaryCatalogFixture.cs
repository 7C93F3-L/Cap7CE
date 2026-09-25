using Cap7CE.Core.Catalog;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal sealed class TemporaryCatalogFixture : IDisposable
{
    private readonly string fixtureRoot;

    public TemporaryCatalogFixture()
    {
        var testRoot = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "Cap7CE-Core-Catalog-Tests"));
        fixtureRoot = Path.Combine(testRoot, Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(fixtureRoot);
        DatabasePath = Path.Combine(fixtureRoot, "catalog.db");
        Database = new CatalogDatabase(DatabasePath);
    }

    public string DatabasePath { get; }
    public CatalogDatabase Database { get; }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        var resolved = Path.GetFullPath(fixtureRoot);
        var testRoot = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "Cap7CE-Core-Catalog-Tests"));
        if (!resolved.StartsWith(testRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Refusing to remove a path outside the catalog test root.");
        }
        if (Directory.Exists(resolved)) Directory.Delete(resolved, recursive: true);
        if (Directory.Exists(testRoot) && !Directory.EnumerateFileSystemEntries(testRoot).Any())
        {
            try
            {
                Directory.Delete(testRoot, recursive: false);
            }
            catch (IOException)
            {
                // Another parallel fixture may have populated the shared test root.
            }
        }
    }
}
