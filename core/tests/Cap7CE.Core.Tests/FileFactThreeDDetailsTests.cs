using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactThreeDDetailsTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-three-d-details-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); var path = Path.Combine(root, "fixture.db");
        try
        {
            var catalog = new CatalogV2Database(path); await catalog.InitializeAsync();
            var facts = new FileFactDatabase(path); await facts.InitializeAsync();
            await ExecuteAsync(path, """
                INSERT INTO catalog_volumes_v2 VALUES('fixture','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',1,1,0);
                INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000001',NULL,'a.gltf','.gltf',0,32,1,100,133000000000000001,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000002',NULL,'b.gltf','.gltf',0,32,1,100,133000000000000001,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000003',NULL,'c.gltf','.gltf',0,32,1,100,133000000000000001,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000004',NULL,'d.gltf','.gltf',0,32,1,100,133000000000000001,133000000000000003);
                """);
            var ids = Enumerable.Range(1, 4).Select(number => new CatalogEntryIdentity("fixture", number.ToString("X16"))).ToArray();
            FileFactThreeDProperties[] properties = [new(0, false, false), new(20_000, true), new(HasRig: true), new(9_007_199_254_740_991)];
            for (var i = 0; i < ids.Length; i++) await facts.PublishAsync(new(ids[i], (await facts.CaptureAsync(ids[i]))!, FileFactKind.ThreeD, 2,
                FileFactState.Indexed, ThreeDProperties: properties[i]));
            TestAssert.Equal(properties[3], (await new FileFactDatabase(path).ReadCurrentAsync(ids[3], FileFactKind.ThreeD, 2))!.ThreeDProperties, "64-bit triangle count and unknown booleans survive reopening");
            var filter = new FileFactQueryFilter(FileFactKind.ThreeD, 2);
            var query = new CatalogV2Query("", [], CatalogQueryScope.AllVolumes(), null, CatalogEntryType.File, 2, null, filter);
            var first = await catalog.QueryAsync(query);
            TestAssert.True(first.Next is not null, "3D keyset first page");
            TestAssert.Equal(ids[2], (await catalog.QueryAsync(query with { After = first.Next })).Items.First().Identity, "3D keyset next page retains ordering");
            TestAssert.Equal(ids[0], (await catalog.QueryAsync(query with { Facts = filter with { ThreeD = new(MaximumTriangleCount: 0, Structures: ["static"]) } })).Items.Single().Identity, "known static zero triangles matches");
            TestAssert.Equal(2, (await catalog.QueryAsync(query with { Facts = filter with { ThreeD = new(Structures: ["animated", "rigged"]) } })).Items.Count, "structure alternatives form union");
            TestAssert.Equal(ids[1], (await catalog.QueryAsync(query with { Facts = filter with { ThreeD = new(MinimumTriangleCount: 10_000, Structures: ["animated", "rigged"]) } })).Items.Single().Identity, "triangle range excludes unknown count while combining structures");
            TestAssert.Equal(ids[3], (await catalog.QueryAsync(query with { Facts = filter with { ThreeD = new(MinimumTriangleCount: 2_000_000_000) } })).Items.Single().Identity, "safe long counts remain greater than UI upper custom bound");
            var allStructures = await catalog.QueryAsync(query with { PageSize = 10, Facts = filter with { ThreeD = new(Structures: ["static", "animated", "rigged"]) } });
            TestAssert.Equal(3, allStructures.Items.Count, "unknown structures do not match selected all");
            var observation = new FileFactObservation(ids[0], (await facts.CaptureAsync(ids[0]))!, FileFactKind.ThreeD, 2, FileFactState.Indexed, ThreeDProperties: properties[0]);
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { ThreeDProperties = new() }), "all-unknown vector rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { ThreeDProperties = new(9_007_199_254_740_992) }), "unsafe triangle integer rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { Kind = FileFactKind.Font }), "3D vector cannot attach to font");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(query with { Facts = filter with { MinimumWidth = 1 } }), "3D visual width rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(query with { Facts = filter with { ThreeD = new(Structures: ["unknown"]) } }), "unknown structure rejected");
            var revision = await facts.ReadRevisionAsync();
            await ExecuteAsync(path, "CREATE TRIGGER abort_three_d_details BEFORE INSERT ON file_fact_three_d_details BEGIN SELECT RAISE(ABORT,'test failure'); END;");
            await TestAssert.ThrowsAsync<SqliteException>(() => facts.PublishAsync(observation with { ExtractorVersion = 3 }), "3D publication is atomic");
            TestAssert.Equal(properties[0], (await facts.ReadCurrentAsync(ids[0], FileFactKind.ThreeD, 2))!.ThreeDProperties, "3D rollback retains previous version");
            TestAssert.Equal(revision, await facts.ReadRevisionAsync(), "3D revision rolls back");
            await ExecuteAsync(path, "DROP TRIGGER abort_three_d_details;");
            await facts.PublishAsync(observation with { State = FileFactState.Failed, ThreeDProperties = null, ErrorCode = "fixture-failed" });
            TestAssert.True((await facts.ReadCurrentAsync(ids[0], FileFactKind.ThreeD, 2))!.ThreeDProperties is null, "failed replacement clears detail");
            await facts.InvalidateVolumeAsync("fixture");
            TestAssert.Equal(0, (await catalog.QueryAsync(query)).Items.Count, "source fence invalidates 3D facts");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
    private static async Task ExecuteAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; await command.ExecuteNonQueryAsync();
    }
}
