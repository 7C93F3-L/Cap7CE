using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Catalog;

public sealed record CatalogNativeDependencyProbeReport(
    string Status,
    bool InMemory,
    bool SourceFilesRead);

public static class CatalogNativeDependencyProbe
{
    public static async Task<CatalogNativeDependencyProbeReport> RunAsync(
        CancellationToken cancellationToken = default)
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT 1;";
        var value = await command.ExecuteScalarAsync(cancellationToken);
        if (Convert.ToInt32(value) != 1)
        {
            throw new InvalidDataException("native-sqlite-probe-failed");
        }
        return new("passed", true, false);
    }
}
