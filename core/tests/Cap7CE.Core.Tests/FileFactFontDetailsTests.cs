using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactFontDetailsTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-font-details-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); var path = Path.Combine(root, "fixture.db");
        try
        {
            var catalog = new CatalogV2Database(path); await catalog.InitializeAsync();
            var facts = new FileFactDatabase(path); await facts.InitializeAsync();
            await ExecuteAsync(path, """
                INSERT INTO catalog_volumes_v2 VALUES('fixture','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',1,1,0);
                INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000001',NULL,'one.ttf','.ttf',0,32,1,100,133000000000000001,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000002',NULL,'two.ttf','.ttf',0,32,1,100,133000000000000001,133000000000000003);
                """);
            var identity = new CatalogEntryIdentity("fixture", "0000000000000001");
            var observation = new FileFactObservation(identity, (await facts.CaptureAsync(identity))!, FileFactKind.Font, 1,
                FileFactState.Indexed, FontProperties: new(400, false, true, false, false));
            await facts.PublishAsync(observation);
            var other = new CatalogEntryIdentity("fixture", "0000000000000002");
            await facts.PublishAsync(observation with { Identity = other, Source = (await facts.CaptureAsync(other))!, FontProperties = new(700, true, true, true, true) });
            TestAssert.Equal(observation.FontProperties, (await new FileFactDatabase(path).ReadCurrentAsync(identity, FileFactKind.Font, 1))!.FontProperties, "known false font values survive reopening");
            var filter = new FileFactQueryFilter(FileFactKind.Font, 1);
            var query = new CatalogV2Query("", [], CatalogQueryScope.AllVolumes(), null, CatalogEntryType.File, 1, null, filter);
            var first = await catalog.QueryAsync(query);
            TestAssert.True(first.Next is not null, "font facts page without dimensions or duration");
            TestAssert.Equal(other, (await catalog.QueryAsync(query with { After = first.Next })).Items.Single().Identity, "font keyset second page");
            TestAssert.Equal(1, (await catalog.QueryAsync(query with { Facts = filter with { Font = new(SupportsLatin: true, SupportsChinese: true) } })).Items.Count, "selected character sets intersect");
            TestAssert.Equal(other, (await catalog.QueryAsync(query with { Facts = filter with { Font = new(WeightRanges: [new(1, 349), new(600, 799)], Italic: true, Variable: true) } })).Items.Single().Identity, "weight union intersects style and variable");
            TestAssert.Equal(identity, (await catalog.QueryAsync(query with { Facts = filter with { Font = new(Italic: false, Variable: false) } })).Items.Single().Identity, "known normal static differs from unknown");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { FontProperties = new(400) }), "missing boolean properties cannot become false");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { Kind = FileFactKind.Audio }), "font vector cannot attach to audio");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(query with { Facts = filter with { MinimumDurationMilliseconds = 1 } }), "font duration rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(query with { Facts = filter with { Font = new(WeightRanges: [new(1001)]) } }), "font weight outside range rejected");
            var revision = await facts.ReadRevisionAsync();
            await ExecuteAsync(path, "CREATE TRIGGER abort_font_details BEFORE INSERT ON file_fact_font_details BEGIN SELECT RAISE(ABORT,'test failure'); END;");
            await TestAssert.ThrowsAsync<SqliteException>(() => facts.PublishAsync(observation with { ExtractorVersion = 2 }), "font details failure rolls back extractor replacement");
            TestAssert.Equal(observation.FontProperties, (await facts.ReadCurrentAsync(identity, FileFactKind.Font, 1))!.FontProperties, "font rollback retains previous version");
            TestAssert.Equal(revision, await facts.ReadRevisionAsync(), "font revision rolls back");
            await ExecuteAsync(path, "DROP TRIGGER abort_font_details;");
            await facts.PublishAsync(observation with { State = FileFactState.Failed, FontProperties = null, ErrorCode = "fixture-failed" });
            TestAssert.True((await facts.ReadCurrentAsync(identity, FileFactKind.Font, 1))!.FontProperties is null, "failed replacement clears font properties");
            TestAssert.Equal(other, (await catalog.QueryAsync(query)).Items.Single().Identity, "failed font never matches known normal");
            await facts.InvalidateVolumeAsync("fixture");
            TestAssert.Equal(0, (await catalog.QueryAsync(query)).Items.Count, "volume invalidation protects font details");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
    private static async Task ExecuteAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; await command.ExecuteNonQueryAsync();
    }
}
