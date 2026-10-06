using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactCatalogIntegrationTests
{
    public static async Task RunAsync()
    {
        foreach (var reason in new uint[] { 1, 2, 4, 0x10, 0x20, 0x40, 0x100, 0x200, 0x400, 0x800, 0x20000, 0x40000, 0x100000, 0x200000, 0x400000 })
            TestAssert.True(CatalogFactChangeClassifier.Invalidates(reason), "USN fact-changing reason");
        foreach (var reason in new uint[] { 0, 0x1000, 0x2000, 0x10000, 0x80000000, 0x80003000 })
            TestAssert.False(CatalogFactChangeClassifier.Invalidates(reason), "rename/hardlink/close-only reuse");
        TestAssert.True(CatalogFactChangeClassifier.MayChangeFormat(0x80002000), "rename-new checks format even with close bit");
        TestAssert.False(CatalogFactChangeClassifier.MayChangeFormat(0x80010000), "hardlink/close does not change format");
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-fact-incremental-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "fixture.db");
        try
        {
            var catalog = new CatalogV2Database(path);
            await catalog.InitializeAsync();
            var facts = new FileFactDatabase(path);
            await facts.InitializeAsync();
            await catalog.RegisterVolumeAsync("v", "X:", "NTFS", true);
            await catalog.BeginBuildAsync("v", "42", 10, 0, 0, 2, false);
            var directory = new CatalogV2NodeRecord(new("v", "0000000000000001"), null, "root", "", true, 16, true, null, 1, 1);
            var node = new CatalogV2NodeRecord(new("v", "0000000000000002"), "0000000000000001", "one.png", ".png", false, 32, true, 100, 1, 133000000000000003);
            var checkpoint = 10L;
            async Task ApplyAsync(params CatalogV2NodeRecord[] nodes)
            {
                await catalog.ApplyBatchAsync(new("v", "42", checkpoint, await catalog.ReadRevisionAsync(), checkpoint + 1, 0, 0, nodes));
                checkpoint++;
            }
            await ApplyAsync(directory, node);
            await catalog.CompleteSynchronizationAsync("v");
            var source = (await facts.CaptureAsync(node.Identity))!;
            var observation = new FileFactObservation(node.Identity, source, FileFactKind.ImageDimensions, 1, FileFactState.Indexed, 640, 480);
            await facts.PublishAsync(observation);
            await catalog.BeginCatchUpAsync("v", "42", 0, 0);
            await ApplyAsync(node with { Name = "renamed.png", MayChangeFileFormat = true });
            await catalog.CompleteSynchronizationAsync("v");
            TestAssert.Equal(observation, await facts.ReadCurrentAsync(node.Identity, observation.Kind, 1), "Catalog rename-only batch retains fact");
            await catalog.BeginCatchUpAsync("v", "42", 0, 0);
            await ApplyAsync(node with { InvalidatesFileFacts = true }, node with { Name = "final-name.png" });
            await catalog.CompleteSynchronizationAsync("v");
            TestAssert.True(await facts.ReadCurrentAsync(node.Identity, observation.Kind, 1) is null, "write followed by rename in same batch still invalidates");
            TestAssert.Equal(FileFactPublishResult.SourceChanged, await facts.PublishAsync(observation), "old content observation fenced");
            source = (await facts.CaptureAsync(node.Identity))!;
            TestAssert.Equal(1L, source.ContentRevision, "one generation for deduplicated changed identity");
            observation = observation with { Source = source };
            await facts.PublishAsync(observation);
            await catalog.BeginCatchUpAsync("v", "42", 0, 0);
            await ExecuteAsync(path, """
                CREATE TRIGGER reject_checkpoint BEFORE UPDATE ON catalog_volumes_v2
                WHEN NEW.checkpoint_usn <> OLD.checkpoint_usn
                BEGIN SELECT RAISE(ABORT, 'fixture-reject-checkpoint'); END;
                """);
            await TestAssert.ThrowsAsync<SqliteException>(() => ApplyAsync(node with { InvalidatesFileFacts = true }), "base batch failure rolls back source fence");
            await ExecuteAsync(path, "DROP TRIGGER reject_checkpoint;");
            await catalog.CompleteSynchronizationAsync("v");
            TestAssert.Equal(observation, await facts.ReadCurrentAsync(node.Identity, observation.Kind, 1), "failed base update leaves previous facts current");
            await catalog.BeginCatchUpAsync("v", "42", 0, 0);
            await ApplyAsync(node with { Name = "format-changed.csv", Extension = ".csv", MayChangeFileFormat = true });
            await catalog.CompleteSynchronizationAsync("v");
            TestAssert.True(await facts.ReadCurrentAsync(node.Identity, observation.Kind, 1) is null, "extension-only rename invalidates unchanged bytes and time");
            TestAssert.Equal(FileFactPublishResult.SourceChanged, await facts.PublishAsync(observation), "pre-format-change observation fenced");
            source = (await facts.CaptureAsync(node.Identity))!;
            observation = new(node.Identity, source, FileFactKind.TextData, 2, FileFactState.Indexed,
                TextDataProperties: new("csv", RecordCount: 2, ColumnCount: 3));
            await facts.PublishAsync(observation);
            await catalog.BeginCatchUpAsync("v", "42", 0, 0);
            await ApplyAsync(node with { Name = "format-changed.json", Extension = ".json", MayChangeFileFormat = true });
            await catalog.CompleteSynchronizationAsync("v");
            TestAssert.True(await facts.ReadCurrentAsync(node.Identity, FileFactKind.TextData, 2) is null, "CSV to JSON cannot reuse same-kind subformat counts");
            source = (await facts.CaptureAsync(node.Identity))!;
            observation = observation with { Source = source, TextDataProperties = new("json", RecordCount: 1, JsonRootKind: "object") };
            await facts.PublishAsync(observation);
            await catalog.MarkNeedsRebuildAsync("v");
            await catalog.BeginBuildAsync("v", "42", checkpoint, 0, 0, 2, true);
            await ApplyAsync(directory, node);
            await catalog.CompleteSynchronizationAsync("v");
            TestAssert.True(await facts.ReadCurrentAsync(node.Identity, observation.Kind, observation.ExtractorVersion) is null, "journal gap/rebuild invalidates unchanged size and time");
            TestAssert.Equal(FileFactPublishResult.SourceChanged, await facts.PublishAsync(observation), "pre-rebuild worker cannot publish after rebuild");
            TestAssert.True((await facts.CaptureAsync(node.Identity))!.VolumeEpoch > source.VolumeEpoch, "rebuild advances durable volume epoch");
            TestAssert.True(await catalog.CheckIntegrityAsync(), "base and facts integrity");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }

    private static async Task ExecuteAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection($"Data Source={path};Pooling=False");
        await connection.OpenAsync();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync();
    }
}
