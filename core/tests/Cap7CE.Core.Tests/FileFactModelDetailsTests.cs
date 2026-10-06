using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactModelDetailsTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-model-details-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); var path = Path.Combine(root, "fixture.db");
        try
        {
            var catalog = new CatalogV2Database(path); await catalog.InitializeAsync();
            var facts = new FileFactDatabase(path); await facts.InitializeAsync();
            await ExecuteAsync(path, """
                INSERT INTO catalog_volumes_v2 VALUES('fixture','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',1,1,0);
                INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000001',NULL,'one.gguf','.gguf',0,32,1,100,133000000000000001,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000002',NULL,'two.gguf','.gguf',0,32,1,100,133000000000000001,133000000000000003);
                """);
            var identity = new CatalogEntryIdentity("fixture", "0000000000000001");
            var other = new CatalogEntryIdentity("fixture", "0000000000000002");
            var observation = new FileFactObservation(identity, (await facts.CaptureAsync(identity))!, FileFactKind.Model, 1,
                FileFactState.Indexed, ModelProperties: new(2_999_999_999, "4bit"));
            await facts.PublishAsync(observation);
            await facts.PublishAsync(observation with { Identity = other, Source = (await facts.CaptureAsync(other))!, ModelProperties = new(3_000_000_000, "8bit") });
            TestAssert.Equal(observation.ModelProperties, (await new FileFactDatabase(path).ReadCurrentAsync(identity, FileFactKind.Model, 1))!.ModelProperties, "64-bit model count survives reopening");
            var filter = new FileFactQueryFilter(FileFactKind.Model, 1);
            var query = new CatalogV2Query("", [], CatalogQueryScope.AllVolumes(), null, CatalogEntryType.File, 1, null, filter);
            var first = await catalog.QueryAsync(query);
            TestAssert.True(first.Next is not null, "model facts page without dimensions");
            TestAssert.Equal(other, (await catalog.QueryAsync(query with { After = first.Next })).Items.Single().Identity, "model keyset second page");
            TestAssert.Equal(identity, (await catalog.QueryAsync(query with { Facts = filter with { Model = new([new(1_000_000_000, 2_999_999_999)]) } })).Items.Single().Identity, "parameter upper boundary excludes next band");
            TestAssert.Equal(other, (await catalog.QueryAsync(query with { Facts = filter with { Model = new([new(1, 999_999_999), new(3_000_000_000, 6_999_999_999)], ["8bit", "f32"]) } })).Items.Single().Identity, "parameter union intersects precision union");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { ModelProperties = new(123) }), "unknown precision is not a known model");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { ModelProperties = new(9_007_199_254_740_992, "f32") }), "unsafe JS count rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { Kind = FileFactKind.Font }), "model vector cannot attach to font");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(query with { Facts = filter with { MinimumDurationMilliseconds = 1 } }), "model duration rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(query with { Facts = filter with { Model = new(Precisions: ["unknown"]) } }), "unknown precision predicate rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(query with { Facts = filter with { Model = new([new(3, 2)]) } }), "reversed range rejected");
            var revision = await facts.ReadRevisionAsync();
            await ExecuteAsync(path, "CREATE TRIGGER abort_model_details BEFORE INSERT ON file_fact_model_details BEGIN SELECT RAISE(ABORT,'test failure'); END;");
            await TestAssert.ThrowsAsync<SqliteException>(() => facts.PublishAsync(observation with { ExtractorVersion = 2 }), "model publication is atomic");
            TestAssert.Equal(observation.ModelProperties, (await facts.ReadCurrentAsync(identity, FileFactKind.Model, 1))!.ModelProperties, "model rollback retains previous version");
            TestAssert.Equal(revision, await facts.ReadRevisionAsync(), "model revision rolls back");
            await ExecuteAsync(path, "DROP TRIGGER abort_model_details;");
            await facts.PublishAsync(observation with { State = FileFactState.Failed, ModelProperties = null, ErrorCode = "fixture-failed" });
            TestAssert.True((await facts.ReadCurrentAsync(identity, FileFactKind.Model, 1))!.ModelProperties is null, "failed replacement clears model details");
            TestAssert.Equal(other, (await catalog.QueryAsync(query)).Items.Single().Identity, "failed model cannot match");
            await facts.InvalidateVolumeAsync("fixture");
            TestAssert.Equal(0, (await catalog.QueryAsync(query)).Items.Count, "source fence invalidates model vector");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
    private static async Task ExecuteAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; await command.ExecuteNonQueryAsync();
    }
}
