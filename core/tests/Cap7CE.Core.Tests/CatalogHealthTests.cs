using Cap7CE.Core.Host.CatalogStorage;
using Microsoft.Data.Sqlite;
namespace Cap7CE.Core.Tests;
internal static class CatalogHealthTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "cap7ce-health-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try {
            var path = Path.Combine(root, "healthy.db");
            await using (var connection = new SqliteConnection($"Data Source={path};Pooling=False")) {
                await connection.OpenAsync();
                using var command = connection.CreateCommand(); command.CommandText = "CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES('keep');";
                await command.ExecuteNonQueryAsync();
            }
            var before = await File.ReadAllBytesAsync(path);
            var healthy = await CatalogHealthCheck.RunAsync(path);
            if (healthy.Status != "ok" || healthy.Problems.Length != 0 || !before.SequenceEqual(await File.ReadAllBytesAsync(path))) throw new Exception("Healthy check mutated database");
            await using (var connection = new SqliteConnection($"Data Source={path};Pooling=False")) {
                await connection.OpenAsync();
                using var command = connection.CreateCommand();
                command.CommandText = "CREATE TABLE invalid(value INTEGER CHECK(value > 0)); PRAGMA ignore_check_constraints=ON; INSERT INTO invalid VALUES(-1); PRAGMA ignore_check_constraints=OFF;";
                await command.ExecuteNonQueryAsync();
            }
            var issues = await CatalogHealthCheck.RunAsync(path);
            if (issues.Status != "issues" || !issues.Problems.Any(p => p.Contains("invalid"))) throw new Exception("Check did not preserve table-specific issue details: " + System.Text.Json.JsonSerializer.Serialize(issues));
            var broken = Path.Combine(root, "broken.db"); await File.WriteAllTextAsync(broken, new string('X', 8192));
            var error = await CatalogHealthCheck.RunAsync(broken);
            if (error.Status != "error" || error.Problems.Length == 0) throw new Exception("Unreadable database not reported");
            var missing = Path.Combine(root, "missing.db");
            if ((await CatalogHealthCheck.RunAsync(missing)).Status != "error" || File.Exists(missing)) throw new Exception("Read-only check created storage");
            Console.WriteLine("Health checks passed: healthy bytes unchanged, table-specific issues, malformed database error, missing database not created.");
        } finally { Directory.Delete(root, true); }
    }
}
