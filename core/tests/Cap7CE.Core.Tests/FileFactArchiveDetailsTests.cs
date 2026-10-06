using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactArchiveDetailsTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-archive-details-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); var path = Path.Combine(root, "fixture.db");
        try
        {
            var catalog = new CatalogV2Database(path); await catalog.InitializeAsync();
            var facts = new FileFactDatabase(path); await facts.InitializeAsync();
            await ExecuteAsync(path, "INSERT INTO catalog_volumes_v2 VALUES('fixture','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',1,1,0);");
            var ids = Enumerable.Range(1, 5).Select(number => new CatalogEntryIdentity("fixture", number.ToString("X16"))).ToArray();
            FileFactArchiveProperties[] properties = [new(true, 0, false, []), new(true, 12, false, ["image"]),
                new(true, 200, true, ["document", "audio"]), new(false, null, true, ["image"]), new(false, null, null, ["program"])];
            for (var i = 0; i < ids.Length; i++) {
                await ExecuteAsync(path, $"INSERT INTO catalog_nodes_v2 VALUES('fixture','{ids[i].FileReference}',NULL,'file-{i}.zip','.zip',0,32,1,100,133000000000000001,133000000000000003);");
                await facts.PublishAsync(new(ids[i], (await facts.CaptureAsync(ids[i]))!, FileFactKind.Archive, 2,
                    FileFactState.Indexed, ArchiveProperties: properties[i]));
            }
            var reopened = (await new FileFactDatabase(path).ReadCurrentAsync(ids[2], FileFactKind.Archive, 2))!.ArchiveProperties!;
            TestAssert.Equal(200L, reopened.FileCount!.Value, "archive count survives reopen");
            TestAssert.True(reopened.ContentTypes.SequenceEqual(["audio", "document"]), "fixed type bitset survives reopen");
            var filter = new FileFactQueryFilter(FileFactKind.Archive, 2);
            var query = new CatalogV2Query("", [], CatalogQueryScope.AllVolumes(), null, CatalogEntryType.File, 10, null, filter);
            TestAssert.Equal(5, (await catalog.QueryAsync(query)).Items.Count, "complete and useful partial facts searchable");
            TestAssert.Equal(ids[0], (await catalog.QueryAsync(query with { Facts = filter with { Archive = new(MaximumFileCount: 0) } })).Items.Single().Identity, "known empty excludes unknown count");
            TestAssert.Equal(2, (await catalog.QueryAsync(query with { Facts = filter with { Archive = new(Structures: ["flat"]) } })).Items.Count, "flat excludes partial unknown");
            TestAssert.Equal(2, (await catalog.QueryAsync(query with { Facts = filter with { Archive = new(Structures: ["nested"]) } })).Items.Count, "partial positive nesting remains usable");
            TestAssert.Equal(4, (await catalog.QueryAsync(query with { Facts = filter with { Archive = new(Structures: ["flat", "nested"]) } })).Items.Count, "both structures still exclude unknown");
            TestAssert.Equal(3, (await catalog.QueryAsync(query with { Facts = filter with { Archive = new(ContentTypes: ["image", "audio"]) } })).Items.Count, "type alternatives form union");
            TestAssert.Equal(ids[1], (await catalog.QueryAsync(query with { Facts = filter with { Archive = new(MaximumFileCount: 20, ContentTypes: ["image"], Structures: ["flat"]) } })).Items.Single().Identity, "count type and structure intersect");
            var first = await catalog.QueryAsync(query with { PageSize = 2 });
            TestAssert.Equal(ids[2], (await catalog.QueryAsync(query with { PageSize = 2, After = first.Next })).Items.First().Identity, "archive keyset pagination");
            var observation = new FileFactObservation(ids[0], (await facts.CaptureAsync(ids[0]))!, FileFactKind.Archive, 2, FileFactState.Indexed, ArchiveProperties: properties[0]);
            foreach (var invalid in new FileFactArchiveProperties[] { new(false, 0, null, ["image"]), new(false, null, false, ["image"]),
                new(false, null, null, []), new(true, null, false, []), new(true, 0, false, ["bad"]), new(true, 0, false, ["image", "image"]) })
                await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { ArchiveProperties = invalid }), "invalid or ambiguous archive vector rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { Kind = FileFactKind.TextData }), "archive vector rejects other domain");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(query with { Facts = filter with { MinimumWidth = 1 } }), "archive rejects dimensions");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(query with { Facts = filter with { Archive = new(Structures: ["bad"]) } }), "invalid structure rejected");
            var revision = await facts.ReadRevisionAsync();
            await ExecuteAsync(path, "CREATE TRIGGER abort_archive_details BEFORE INSERT ON file_fact_archive_details BEGIN SELECT RAISE(ABORT,'test failure'); END;");
            await TestAssert.ThrowsAsync<SqliteException>(() => facts.PublishAsync(observation with { ExtractorVersion = 3 }), "archive publication atomic");
            TestAssert.Equal(revision, await facts.ReadRevisionAsync(), "fact revision rolls back with details");
            TestAssert.Equal(0L, (await facts.ReadCurrentAsync(ids[0], FileFactKind.Archive, 2))!.ArchiveProperties!.FileCount!.Value, "previous detail survives rollback");
            await ExecuteAsync(path, "DROP TRIGGER abort_archive_details;");
            await facts.PublishAsync(observation with { State = FileFactState.Failed, ArchiveProperties = null, ErrorCode = "fixture-failed" });
            TestAssert.True((await facts.ReadCurrentAsync(ids[0], FileFactKind.Archive, 2))!.ArchiveProperties is null, "failed replacement clears detail");
            await facts.InvalidateVolumeAsync("fixture");
            TestAssert.Equal(0, (await catalog.QueryAsync(query)).Items.Count, "source fence invalidates archive matches");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
    private static async Task ExecuteAsync(string path, string sql) {
        await using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; await command.ExecuteNonQueryAsync();
    }
}
