using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactTextDataDetailsTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-text-data-details-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); var path = Path.Combine(root, "fixture.db");
        try
        {
            var catalog = new CatalogV2Database(path); await catalog.InitializeAsync();
            var facts = new FileFactDatabase(path); await facts.InitializeAsync();
            await ExecuteAsync(path, "INSERT INTO catalog_volumes_v2 VALUES('fixture','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',1,1,0);");
            var ids = Enumerable.Range(1, 6).Select(number => new CatalogEntryIdentity("fixture", number.ToString("X16"))).ToArray();
            FileFactTextDataProperties[] properties = [new("text", 0, 0), new("text", 102, 3),
                new("csv", RecordCount: 0, ColumnCount: 0), new("csv", RecordCount: 3, ColumnCount: 2),
                new("json", RecordCount: 0, JsonRootKind: "array"), new("json", RecordCount: 3, JsonRootKind: "object")];
            for (var i = 0; i < ids.Length; i++)
            {
                await ExecuteAsync(path, $"INSERT INTO catalog_nodes_v2 VALUES('fixture','{ids[i].FileReference}',NULL,'file-{i}.txt','.txt',0,32,1,100,133000000000000001,133000000000000003);");
                await facts.PublishAsync(new(ids[i], (await facts.CaptureAsync(ids[i]))!, FileFactKind.TextData, 2,
                    FileFactState.Indexed, TextDataProperties: properties[i]));
            }
            TestAssert.Equal(properties[4], (await new FileFactDatabase(path).ReadCurrentAsync(ids[4], FileFactKind.TextData, 2))!.TextDataProperties, "empty JSON container and omitted unrelated counts survive reopening");
            var filter = new FileFactQueryFilter(FileFactKind.TextData, 2);
            var query = new CatalogV2Query("", [], CatalogQueryScope.AllVolumes(), null, CatalogEntryType.File, 2, null, filter);
            var first = await catalog.QueryAsync(query);
            TestAssert.True(first.Next is not null, "text/data keyset first page");
            TestAssert.Equal(ids[2], (await catalog.QueryAsync(query with { After = first.Next })).Items.First().Identity, "next keyset retains family and ordering");
            TestAssert.Equal(ids[0], (await catalog.QueryAsync(query with { Facts = filter with { TextData = new("text", MaximumCharacterCount: 0) } })).Items.Single().Identity, "empty text has known zero, unrelated zero placeholders do not match");
            TestAssert.Equal(ids[1], (await catalog.QueryAsync(query with { Facts = filter with { TextData = new("text", MinimumCharacterCount: 101, MaximumLineCount: 3) } })).Items.Single().Identity, "text character and line bounds intersect");
            TestAssert.Equal(ids[3], (await catalog.QueryAsync(query with { Facts = filter with { TextData = new("csv", MinimumRecordCount: 3, MaximumColumnCount: 2) } })).Items.Single().Identity, "CSV records and columns intersect");
            TestAssert.Equal(ids[4], (await catalog.QueryAsync(query with { Facts = filter with { TextData = new("json", MaximumRecordCount: 0, JsonRootKind: "array") } })).Items.Single().Identity, "empty array has known root and zero items");
            var observation = new FileFactObservation(ids[0], (await facts.CaptureAsync(ids[0]))!, FileFactKind.TextData, 2, FileFactState.Indexed, TextDataProperties: properties[0]);
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { TextDataProperties = new("text", 0) }), "missing required text count cannot publish");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { TextDataProperties = new("csv", RecordCount: 0, ColumnCount: 0, CharacterCount: 0) }), "unrelated placeholder rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { TextDataProperties = new("json", RecordCount: 0, JsonRootKind: "scalar") }), "unknown root rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { TextDataProperties = new("text", 9_007_199_254_740_992, 1) }), "unsafe integer rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { Kind = FileFactKind.ThreeD }), "text vector cannot attach to another domain");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(query with { Facts = filter with { MinimumWidth = 1 } }), "visual condition rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(query with { Facts = filter with { TextData = new("csv", MinimumLineCount: 0) } }), "CSV cannot match text line placeholder");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(query with { Facts = filter with { TextData = new("text", MinimumCharacterCount: 1_000_000_001) } }), "UI count bound enforced");
            var revision = await facts.ReadRevisionAsync();
            await ExecuteAsync(path, "CREATE TRIGGER abort_text_details BEFORE INSERT ON file_fact_text_data_details BEGIN SELECT RAISE(ABORT,'test failure'); END;");
            await TestAssert.ThrowsAsync<SqliteException>(() => facts.PublishAsync(observation with { ExtractorVersion = 3 }), "text/data publication atomic");
            TestAssert.Equal(properties[0], (await facts.ReadCurrentAsync(ids[0], FileFactKind.TextData, 2))!.TextDataProperties, "previous detail survives rollback");
            TestAssert.Equal(revision, await facts.ReadRevisionAsync(), "revision rolls back with parent and detail");
            await ExecuteAsync(path, "DROP TRIGGER abort_text_details;");
            await facts.PublishAsync(observation with { State = FileFactState.Failed, TextDataProperties = null, ErrorCode = "fixture-failed" });
            TestAssert.True((await facts.ReadCurrentAsync(ids[0], FileFactKind.TextData, 2))!.TextDataProperties is null, "failed replacement clears detail");
            await facts.InvalidateVolumeAsync("fixture");
            TestAssert.Equal(0, (await catalog.QueryAsync(query)).Items.Count, "source fence invalidates all text/data detail matches");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
    private static async Task ExecuteAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; await command.ExecuteNonQueryAsync();
    }
}
