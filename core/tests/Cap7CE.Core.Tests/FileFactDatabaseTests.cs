using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;
using System.Text.Json;

namespace Cap7CE.Core.Tests;

internal static class FileFactDatabaseTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-file-facts-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "fixture.db");
        try
        {
            await TestAssert.ThrowsAsync<SqliteException>(
                () => new FileFactDatabase(path).InitializeAsync(), "fact store must not create a missing catalog");
            TestAssert.False(File.Exists(path), "missing catalog remains absent");
            await new CatalogV2Database(path).InitializeAsync();
            var facts = new FileFactDatabase(path);
            await facts.InitializeAsync();
            await facts.InitializeAsync();
            TestAssert.Equal(0L, await facts.ReadRevisionAsync(), "new fact domain starts at revision zero");
            await ExecuteAsync(path, """
                INSERT INTO catalog_volumes_v2 VALUES('fixture', 'X:', 'NTFS', 1, NULL, NULL, NULL, NULL, 'ready', 1, 1, 0);
                INSERT INTO catalog_nodes_v2 VALUES('fixture', '0000000000000001', NULL, 'one.png', '.png', 0, 32, 1, 100, 133000000000000001, 133000000000000003);
                """);
            var identity = new CatalogEntryIdentity("fixture", "0000000000000001");
            var source = await facts.CaptureAsync(identity);
            TestAssert.True(source is not null, "live file source available");
            TestAssert.Equal(133000000000000003L, source!.ModifiedFileTime, "FILETIME retains sub-JS-number precision");
            var resolver = new FileFactSourceResolver(path);
            var resolved = await resolver.ResolveAsync(identity);
            TestAssert.Equal("X:\\one.png", resolved!.FullPath, "source path derived from current Catalog");
            TestAssert.Equal(source, resolved.Source, "source path and version from one read snapshot");
            await ExecuteAsync(path, "UPDATE catalog_nodes_v2 SET name = '..\\escape.png';");
            TestAssert.True(await resolver.ResolveAsync(identity) is null, "path traversal not resolved");
            await ExecuteAsync(path, "UPDATE catalog_nodes_v2 SET name = 'one.png'; UPDATE catalog_volumes_v2 SET display_name = '\\\\remote';");
            TestAssert.True(await resolver.ResolveAsync(identity) is null, "non-local volume display rejected");
            await ExecuteAsync(path, "UPDATE catalog_volumes_v2 SET display_name = 'X:'; UPDATE catalog_nodes_v2 SET parent_file_reference = '0000000000000009';");
            TestAssert.True(await resolver.ResolveAsync(identity) is null, "missing parent path does not fall back to wrong root");
            await ExecuteAsync(path, "UPDATE catalog_nodes_v2 SET parent_file_reference = NULL;");
            var serialized = JsonSerializer.Serialize(source);
            TestAssert.True(serialized.Contains("\"modifiedFileTime\":\"133000000000000003\"", StringComparison.Ordinal), "JSON source fence uses decimal string");
            TestAssert.Equal(source, JsonSerializer.Deserialize<FileFactSourceVersion>(serialized), "source JSON exact roundtrip");
            foreach (var invalid in new[] {
                "{\"sizeBytes\":100,\"modifiedFileTime\":\"1\",\"volumeEpoch\":\"0\",\"contentRevision\":\"0\"}",
                "{\"sizeBytes\":\"100\",\"sizeBytes\":\"100\",\"modifiedFileTime\":\"1\",\"volumeEpoch\":\"0\",\"contentRevision\":\"0\"}",
                "{\"sizeBytes\":\"100\",\"modifiedFileTime\":\"1\",\"volumeEpoch\":\"0\",\"contentRevision\":\"0\",\"extra\":\"0\"}",
                "{\"sizeBytes\":\"100\",\"modifiedFileTime\":\"1e17\",\"volumeEpoch\":\"0\",\"contentRevision\":\"0\"}" })
                await TestAssert.ThrowsAsync<JsonException>(() => Task.FromResult(JsonSerializer.Deserialize<FileFactSourceVersion>(invalid)), "unsafe source JSON rejected");
            var observation = new FileFactObservation(identity, source, FileFactKind.ImageDimensions, 1,
                FileFactState.Indexed, 640, 480);
            TestAssert.Equal(FileFactPublishResult.Published, await facts.PublishAsync(observation), "publish dimensions");
            TestAssert.Equal(1L, await facts.ReadRevisionAsync(), "publication advances fact revision");
            TestAssert.Equal(observation, await new FileFactDatabase(path).ReadCurrentAsync(identity, observation.Kind, 1), "reopen reuse");
            TestAssert.True(await facts.ReadCurrentAsync(identity, observation.Kind, 2) is null, "extractor version requires re-extraction");
            await ExecuteAsync(path, "UPDATE catalog_nodes_v2 SET name = 'renamed.png';");
            TestAssert.Equal(observation, await facts.ReadCurrentAsync(identity, observation.Kind, 1), "rename reuses facts");
            await ExecuteAsync(path, """
                INSERT INTO catalog_saved_scopes_v2 VALUES('favorite', 'fixture', '0000000000000001', 0);
                DELETE FROM catalog_saved_scopes_v2;
                """);
            TestAssert.Equal(observation, await facts.ReadCurrentAsync(identity, observation.Kind, 1), "favorite removal retains facts");
            foreach (var unsafeAttribute in new[] { 0x400, 0x1000, 0x40000, 0x400000 })
            {
                await ExecuteAsync(path, $"UPDATE catalog_nodes_v2 SET attributes = {unsafeAttribute};");
                TestAssert.True(await facts.CaptureAsync(identity) is null, "reparse/offline/recall source not dispatched");
            }
            await ExecuteAsync(path, "UPDATE catalog_nodes_v2 SET attributes = 32;");

            await ExecuteAsync(path, "UPDATE catalog_nodes_v2 SET modified_utc_ticks = modified_utc_ticks + 1;");
            var factRevision = await facts.ReadRevisionAsync();
            TestAssert.True(await facts.ReadCurrentAsync(identity, observation.Kind, 1) is null, "one FILETIME tick change invalidates");
            TestAssert.Equal(FileFactPublishResult.SourceChanged, await facts.PublishAsync(observation), "late source result rejected");
            TestAssert.Equal(factRevision, await facts.ReadRevisionAsync(), "rejected publication does not advance fact revision");
            source = await facts.CaptureAsync(identity);
            observation = observation with { Source = source! };
            await facts.PublishAsync(observation);
            await facts.InvalidateContentAsync(identity);
            TestAssert.True(await facts.ReadCurrentAsync(identity, observation.Kind, 1) is null, "content event invalidates even preserved size/time");
            TestAssert.Equal(FileFactPublishResult.SourceChanged, await facts.PublishAsync(observation), "content generation fences in-flight work");
            source = await facts.CaptureAsync(identity);
            observation = observation with { Source = source! };
            await facts.PublishAsync(observation);
            await facts.InvalidateVolumeAsync(identity.VolumeId);
            TestAssert.True(await facts.ReadCurrentAsync(identity, observation.Kind, 1) is null, "journal gap invalidates whole volume");
            TestAssert.Equal(FileFactPublishResult.SourceChanged, await facts.PublishAsync(observation), "volume epoch fences in-flight work");
            source = await facts.CaptureAsync(identity);
            observation = observation with { Source = source! };
            await facts.PublishAsync(observation);
            await ExecuteAsync(path, "UPDATE catalog_volumes_v2 SET state = 'offline';");
            TestAssert.True(await facts.CaptureAsync(identity) is null, "offline volumes cannot dispatch");
            TestAssert.True(await facts.ReadCurrentAsync(identity, observation.Kind, 1) is null, "offline facts not current");
            TestAssert.Equal(FileFactPublishResult.SourceChanged, await facts.PublishAsync(observation), "offline publication rejected");
            await ExecuteAsync(path, "UPDATE catalog_volumes_v2 SET state = 'ready';");
            var failure = new FileFactObservation(identity, source!, FileFactKind.Video, 2, FileFactState.Unsupported,
                ErrorCode: "unsupported-format");
            await facts.PublishAsync(failure);
            TestAssert.Equal(failure, await facts.ReadCurrentAsync(identity, FileFactKind.Video, 2), "terminal unsupported state cached");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { Width = 0 }), "invalid fact rejected");
            TestAssert.Equal(observation, await facts.ReadCurrentAsync(identity, observation.Kind, 1), "failed publication preserves old fact");
            using var cancelled = new CancellationTokenSource();
            cancelled.Cancel();
            await TestAssert.ThrowsAsync<OperationCanceledException>(() => facts.PublishAsync(observation, cancelled.Token), "cancelled publication rolls back");
            await facts.PublishAsync(observation with { ExtractorVersion = 2 });
            TestAssert.Equal(FileFactPublishResult.ExtractorSuperseded, await facts.PublishAsync(observation), "late old extractor cannot replace new facts");
            await ExecuteAsync(path, "DELETE FROM catalog_nodes_v2;");
            TestAssert.True(await facts.ReadCurrentAsync(identity, observation.Kind, 1) is null, "missing base hides facts");
            TestAssert.Equal(2L, await ScalarAsync(path, "SELECT COUNT(*) FROM file_facts;"), "base deletion does not cascade facts");
            await new CatalogV2Database(path).InitializeAsync();
            TestAssert.Equal("ok", await ScalarTextAsync(path, "PRAGMA integrity_check;"), "extended catalog integrity");
            await ExecuteAsync(path, "PRAGMA ignore_check_constraints = ON; UPDATE file_fact_state SET schema_version = 999;");
            await TestAssert.ThrowsAsync<CatalogSchemaException>(() => facts.InitializeAsync(), "unknown future version rejected without migration");
            TestAssert.Equal(2L, await ScalarAsync(path, "SELECT COUNT(*) FROM file_facts;"), "unsupported schema leaves facts untouched");
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            Directory.Delete(root, true);
        }
    }

    private static async Task ExecuteAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection($"Data Source={path};Pooling=False");
        await connection.OpenAsync();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<long> ScalarAsync(string path, string sql) => long.Parse(await ScalarTextAsync(path, sql));

    private static async Task<string> ScalarTextAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection($"Data Source={path};Mode=ReadOnly;Pooling=False");
        await connection.OpenAsync();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        return Convert.ToString(await command.ExecuteScalarAsync())!;
    }
}
