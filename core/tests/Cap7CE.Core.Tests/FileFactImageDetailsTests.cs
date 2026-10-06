using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactImageDetailsTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-image-details-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "fixture.db");
        try
        {
            await new CatalogV2Database(path).InitializeAsync();
            var facts = new FileFactDatabase(path); await facts.InitializeAsync();
            await ExecuteAsync(path, """
                INSERT INTO catalog_volumes_v2 VALUES('fixture', 'X:', 'NTFS', 1, NULL, NULL, NULL, NULL, 'ready', 1, 1, 0);
                INSERT INTO catalog_nodes_v2 VALUES('fixture', '0000000000000001', NULL, 'one.png', '.png', 0, 32, 1, 100, 133000000000000001, 133000000000000003);
                """);
            var identity = new CatalogEntryIdentity("fixture", "0000000000000001");
            var source = (await facts.CaptureAsync(identity))!;
            var properties = FileFactImageMetrics.Names.ToDictionary(name => name, _ => 0, StringComparer.Ordinal);
            properties["colorRatio.red"] = 10000;
            var observation = new FileFactObservation(identity, source, FileFactKind.ImageDimensions, 2,
                FileFactState.Indexed, 400, 300, IsAnimated: true, VisualProperties: properties);
            await facts.PublishAsync(observation);
            var reopened = await new FileFactDatabase(path).ReadCurrentAsync(identity, observation.Kind, 2);
            TestAssert.Equal(true, reopened!.IsAnimated, "animation survives reopening");
            TestAssert.Equal(10000, reopened.VisualProperties!["colorRatio.red"], "color vector survives reopening");
            TestAssert.Equal(0, reopened.VisualProperties["brightnessMean"], "known zero is preserved");
            var revision = await facts.ReadRevisionAsync();
            var missing = properties.Where(pair => pair.Key != "colorRatio.red").ToDictionary(pair => pair.Key, pair => pair.Value);
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { VisualProperties = missing }), "partial vectors rejected");
            var overflow = new Dictionary<string, int>(properties) { ["brightnessMean"] = 10001 };
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { VisualProperties = overflow }), "out-of-range metrics rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { State = FileFactState.Failed }), "failed states cannot retain known properties");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { Kind = FileFactKind.Video }), "image detail cannot attach to another fact kind");
            TestAssert.Equal(revision, await facts.ReadRevisionAsync(), "rejected details do not write");

            await ExecuteAsync(path, "CREATE TRIGGER abort_image_details BEFORE INSERT ON file_fact_image_details BEGIN SELECT RAISE(ABORT, 'test publication failure'); END;");
            await TestAssert.ThrowsAsync<SqliteException>(() => facts.PublishAsync(observation with { Width = 800 }), "detail publication rollback");
            TestAssert.Equal(400, (await facts.ReadCurrentAsync(identity, observation.Kind, 2))!.Width, "base dimensions roll back together with detail failure");
            TestAssert.Equal(revision, await facts.ReadRevisionAsync(), "failed detail insert rolls back revision");
            await ExecuteAsync(path, "DROP TRIGGER abort_image_details;");
            TestAssert.Equal(FileFactPublishResult.ExtractorSuperseded, await facts.PublishAsync(observation with { ExtractorVersion = 1, IsAnimated = false }), "older extractor cannot replace details");
            TestAssert.Equal(true, (await facts.ReadCurrentAsync(identity, observation.Kind, 2))!.IsAnimated, "superseded publication retains newer animation");

            await facts.PublishAsync(observation with { IsAnimated = false, VisualProperties = null });
            var animationOnly = await facts.ReadCurrentAsync(identity, observation.Kind, 2);
            TestAssert.Equal(false, animationOnly!.IsAnimated, "known static is distinct from unknown");
            TestAssert.True(animationOnly.VisualProperties is null, "unknown color clears an earlier known vector");
            var catalog = new CatalogV2Database(path);
            async Task<int> CountAsync(FileFactQueryFilter filter) => (await catalog.QueryAsync(new("", [], CatalogQueryScope.AllVolumes(),
                null, CatalogEntryType.File, 100, null, Facts: filter))).Items.Count;
            TestAssert.Equal(1, await CountAsync(new(FileFactKind.ImageDimensions, 2, IsAnimated: false)), "known static query matches");
            TestAssert.Equal(0, await CountAsync(new(FileFactKind.ImageDimensions, 2, IsAnimated: true)), "animation query requires exact known state");
            var red = new FileFactVisualGroup([[new("colorRatio.red", ">", 1500)]]);
            var zeroBrightness = new FileFactVisualGroup([[new("brightnessMean", "<=", 0)]]);
            TestAssert.Equal(0, await CountAsync(new(FileFactKind.ImageDimensions, 2, VisualGroups: [zeroBrightness])), "unknown color does not satisfy a zero upper bound");
            await facts.PublishAsync(observation with { IsAnimated = null, VisualProperties = properties });
            TestAssert.True((await facts.ReadCurrentAsync(identity, observation.Kind, 2))!.IsAnimated is null, "unknown animation remains unknown when color is known");
            TestAssert.Equal(1, await CountAsync(new(FileFactKind.ImageDimensions, 2, VisualGroups: [red, zeroBrightness])), "different property groups combine as intersection");
            TestAssert.Equal(0, await CountAsync(new(FileFactKind.ImageDimensions, 2, IsAnimated: false, VisualGroups: [red])), "unknown animation cannot masquerade as static beside known colors");
            var blue = new FileFactVisualConstraint("colorRatio.blue", ">", 1500);
            var colorUnion = new FileFactVisualGroup([[blue], [new("colorRatio.red", ">", 1500)]]);
            TestAssert.Equal(1, await CountAsync(new(FileFactKind.ImageDimensions, 2, VisualGroups: [colorUnion])), "colors in a group combine as union");
            TestAssert.Equal(0, await CountAsync(new(FileFactKind.ImageDimensions, 2, MinimumWidth: 401, VisualGroups: [red])), "image properties intersect scalar dimensions");
            var video = observation with { Kind = FileFactKind.Video, IsAnimated = null, DurationMilliseconds = 3000 };
            await facts.PublishAsync(video);
            TestAssert.Equal(10000, (await facts.ReadCurrentAsync(identity, FileFactKind.Video, 2))!.VisualProperties!["colorRatio.red"], "video representative color survives reopening");
            TestAssert.Equal(1, await CountAsync(new(FileFactKind.Video, 2, MaximumDurationMilliseconds: 3000, VisualGroups: [red])), "video color intersects known duration");
            TestAssert.Equal(0, await CountAsync(new(FileFactKind.Video, 1, VisualGroups: [red])), "older scalar extractor cannot satisfy representative color predicates");
            TestAssert.Equal(0, await CountAsync(new(FileFactKind.Video, 2, MinimumDurationMilliseconds: 3001, VisualGroups: [red])), "duration excludes otherwise matching colors");
            await facts.PublishAsync(video with { VisualProperties = null });
            TestAssert.Equal(0, await CountAsync(new(FileFactKind.Video, 2, VisualGroups: [zeroBrightness])), "unknown video color cannot masquerade as a known zero");
            TestAssert.Equal(10000, (await facts.ReadCurrentAsync(identity, FileFactKind.ImageDimensions, 2))!.VisualProperties!["colorRatio.red"], "video replacement never removes image properties for the same identity");
            await facts.PublishAsync(video);
            foreach (var invalid in new[] { new FileFactQueryFilter(FileFactKind.Video, 2, IsAnimated: false),
                new FileFactQueryFilter(FileFactKind.ImageDimensions, 2, VisualGroups: []),
                new FileFactQueryFilter(FileFactKind.ImageDimensions, 2, VisualGroups: [new([])]),
                new FileFactQueryFilter(FileFactKind.ImageDimensions, 2, VisualGroups: [new([[new("unknown", ">", 0)]])]),
                new FileFactQueryFilter(FileFactKind.ImageDimensions, 2, VisualGroups: [new([[new("brightnessMean", "=", 0)]])]) })
                await TestAssert.ThrowsAsync<ArgumentException>(() => CountAsync(invalid), "invalid image predicates rejected before SQL");
            await ExecuteAsync(path, "UPDATE catalog_nodes_v2 SET name = 'renamed.png';");
            TestAssert.Equal(10000, (await facts.ReadCurrentAsync(identity, observation.Kind, 2))!.VisualProperties!["colorRatio.red"], "rename retains source-version details");
            await facts.InvalidateContentAsync(identity);
            TestAssert.True(await facts.ReadCurrentAsync(identity, observation.Kind, 2) is null, "content fence hides dimensions and details together");
            TestAssert.Equal(0, await CountAsync(new(FileFactKind.ImageDimensions, 2, VisualGroups: [red])), "color query observes content source fences");
            TestAssert.Equal(0, await CountAsync(new(FileFactKind.Video, 2, VisualGroups: [red])), "video color observes the same content fence");
            TestAssert.Equal(FileFactPublishResult.SourceChanged, await facts.PublishAsync(observation), "late details cannot cross content fence");
            observation = observation with { Source = (await facts.CaptureAsync(identity))!, IsAnimated = null, VisualProperties = null };
            await facts.PublishAsync(observation);
            var unknown = await facts.ReadCurrentAsync(identity, observation.Kind, 2);
            TestAssert.True(unknown!.IsAnimated is null && unknown.VisualProperties is null, "dimensions alone do not fabricate properties");
            await ExecuteAsync(path, "PRAGMA ignore_check_constraints = ON; UPDATE file_fact_state SET schema_version = 1;");
            await TestAssert.ThrowsAsync<CatalogSchemaException>(() => facts.InitializeAsync(), "old experimental schema is rejected without migration or clearing");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
    private static async Task ExecuteAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection($"Data Source={path};Pooling=False");
        await connection.OpenAsync(); using var command = connection.CreateCommand(); command.CommandText = sql;
        await command.ExecuteNonQueryAsync();
    }
}
