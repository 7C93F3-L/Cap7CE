using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.Queries;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogVolumeRootTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-root-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); var path = Path.Combine(root, "catalog.db");
        try
        {
            var catalog = new CatalogV2Database(path); await catalog.InitializeAsync();
            async Task Write(string sql)
            {
                await using var connection = new SqliteConnection($"Data Source={path};Pooling=False");
                await connection.OpenAsync(); using var command = connection.CreateCommand();
                command.CommandText = sql; await command.ExecuteNonQueryAsync();
            }
            await Write("""
                INSERT INTO catalog_volumes_v2 VALUES('fixture','X:','NTFS',1,'0000000000000001',1,0,0,'ready',2,2,0);
                INSERT INTO catalog_nodes_v2 VALUES
                  ('fixture','0001000000000040','0005000000000005','folder','',1,16,1,0,1,1),
                  ('fixture','0001000000000041','0005000000000005','image.png','.png',0,32,1,10,1,1);
                INSERT INTO catalog_directory_paths_v2 VALUES('fixture','0001000000000040','folder');
                """);
            TestAssert.True(await catalog.ResolveDirectoryAsync("fixture", "") is null, "actual enumeration omits root record");
            var resolved = await CatalogVolumeRootResolver.ResolveAsync(catalog, "fixture", CancellationToken.None);
            TestAssert.Equal("0005000000000005", resolved!.Identity.FileReference, "root preserves actual NTFS sequence");
            var page = await catalog.QueryAsync(new("", ["fixture"], CatalogQueryScope.DirectChildren("fixture", resolved.Identity.FileReference),
                null, CatalogEntryType.Any, 100, null));
            TestAssert.Equal(2, page.Items.Count, "implicit root lists files and directories, not descendants");
            await Write("UPDATE catalog_nodes_v2 SET parent_file_reference='0006000000000005' WHERE is_directory=0;");
            TestAssert.True(await CatalogVolumeRootResolver.ResolveAsync(catalog, "fixture", CancellationToken.None) is null,
                "conflicting root sequences reject ambiguous identity");
            await Write("UPDATE catalog_nodes_v2 SET exists_flag=0 WHERE is_directory=0;");
            TestAssert.True(await CatalogVolumeRootResolver.ResolveAsync(catalog, "fixture", CancellationToken.None) is not null,
                "deleted references cannot make a live root ambiguous");
            await Write("UPDATE catalog_volumes_v2 SET file_system='other';");
            TestAssert.True(await CatalogVolumeRootResolver.ResolveAsync(catalog, "fixture", CancellationToken.None) is null,
                "NTFS inference is not applied to other filesystems");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
}
