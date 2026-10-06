using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataExtraction;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactOwnedStorageTests
{
    public static async Task RunAsync()
    {
        if (!OperatingSystem.IsWindows()) return;
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-owned-storage-" + Guid.NewGuid().ToString("N"));
        var ownedPath = Path.Combine(root, "owned", "Cap7CE");
        var unrelatedPath = Path.Combine(root, "personal", "Cap7CE");
        Directory.CreateDirectory(ownedPath); Directory.CreateDirectory(unrelatedPath);
        var databasePath = Path.Combine(root, "fixture.db");
        try {
            var owned = NativeFileFactSourceGuard.CaptureDirectory(ownedPath)!;
            var unrelated = NativeFileFactSourceGuard.CaptureDirectory(unrelatedPath)!;
            var catalog = new CatalogV2Database(databasePath); await catalog.InitializeAsync();
            await new FileFactQueue(databasePath).InitializeAsync();
            await using (var connection = new SqliteConnection("Data Source=" + databasePath)) {
                await connection.OpenAsync(); using var command = connection.CreateCommand();
                command.CommandText = """
                    INSERT INTO catalog_volumes_v2 VALUES($volume,$drive,'NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                    INSERT INTO catalog_nodes_v2 VALUES($volume,$owned,NULL,'Cap7CE','',1,16,1,0,1,1);
                    INSERT INTO catalog_nodes_v2 VALUES($volume,$personal,NULL,'Cap7CE','',1,16,1,0,1,1);
                    INSERT INTO catalog_directory_paths_v2 VALUES($volume,$owned,$ownedPath);
                    INSERT INTO catalog_directory_paths_v2 VALUES($volume,$personal,$personalPath);
                    INSERT INTO catalog_nodes_v2 VALUES($volume,'0000000000000011',$owned,'manifest.json','.json',0,32,1,100,1,133000000000000003);
                    INSERT INTO catalog_nodes_v2 VALUES($volume,'0000000000000012',$personal,'manifest.json','.json',0,32,1,100,1,133000000000000003);
                    """;
                command.Parameters.AddWithValue("$volume", owned.VolumeId); command.Parameters.AddWithValue("$drive", ownedPath[..2]);
                command.Parameters.AddWithValue("$owned", owned.FileReference); command.Parameters.AddWithValue("$personal", unrelated.FileReference);
                command.Parameters.AddWithValue("$ownedPath", ownedPath[3..]); command.Parameters.AddWithValue("$personalPath", unrelatedPath[3..]);
                await command.ExecuteNonQueryAsync();
            }
            var resolved = await FileFactOwnedStorage.ResolveAsync(catalog, [ownedPath, ownedPath]);
            TestAssert.Equal(1, resolved.Count, "duplicate explicitly owned paths resolve once");
            TestAssert.Equal(owned, resolved.Single().Identity, "physical and Catalog storage identity agree");
            FileFactQueuePolicy policy = new([owned.VolumeId], [new(owned.VolumeId)], []);
            var effective = FileFactOwnedStorage.Exclude(policy, resolved);
            TestAssert.Equal(0, policy.Excludes.Count, "implicit storage exclusion cannot mutate user's grant");
            var page = await new FileFactDiscovery(databasePath).ReadPageAsync(effective, FileFactKind.TextData, 2, [".json"]);
            TestAssert.Equal(new CatalogEntryIdentity(owned.VolumeId, "0000000000000012"), page.Jobs.Single().Identity,
                "same-named personal directory remains searchable while owned manifest is excluded");
            await new CatalogV2Database(databasePath).MarkOfflineAsync(owned.VolumeId);
            await TestAssert.ThrowsAsync<InvalidOperationException>(() => FileFactOwnedStorage.ResolveAsync(catalog, [ownedPath]),
                "offline Catalog cannot authorize a stale owned exclusion");
            await ExecuteAsync(databasePath, """
                UPDATE catalog_volumes_v2 SET state='ready';
                INSERT INTO catalog_nodes_v2 SELECT volume_id,'0000000000000999',NULL,'rebound','',1,16,1,0,1,1 FROM catalog_volumes_v2;
                UPDATE catalog_directory_paths_v2 SET file_reference='0000000000000999' WHERE relative_path LIKE '%\owned\Cap7CE';
                """);
            await TestAssert.ThrowsAsync<InvalidOperationException>(() => FileFactOwnedStorage.ResolveAsync(catalog, [ownedPath]),
                "Catalog path identity mismatch fails closed");
            // An unselected volume needs no suppression and must not demand its directory cache.
            await ExecuteAsync(databasePath, "UPDATE catalog_volumes_v2 SET selected=0;");
            TestAssert.Equal(0, (await FileFactOwnedStorage.ResolveAsync(catalog, [ownedPath])).Count, "unselected storage volume adds no scope");
            await TestAssert.ThrowsAsync<InvalidOperationException>(() => FileFactOwnedStorage.ResolveAsync(catalog, [Path.Combine(root, "missing")]),
                "missing owned storage root cannot silently expand an exclusion");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
    private static async Task ExecuteAsync(string path, string sql) {
        await using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; await command.ExecuteNonQueryAsync();
    }
}
