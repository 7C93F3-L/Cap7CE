using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactAudioDetailsTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-audio-details-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "fixture.db");
        try
        {
            var catalog = new CatalogV2Database(path); await catalog.InitializeAsync();
            var facts = new FileFactDatabase(path); await facts.InitializeAsync();
            await ExecuteAsync(path, """
                INSERT INTO catalog_volumes_v2 VALUES('fixture','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',1,1,0);
                INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000001',NULL,'one.wav','.wav',0,32,1,100,133000000000000001,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000002',NULL,'two.wav','.wav',0,32,1,100,133000000000000001,133000000000000003);
                """);
            var identity = new CatalogEntryIdentity("fixture", "0000000000000001");
            var source = (await facts.CaptureAsync(identity))!;
            var observation = new FileFactObservation(identity, source, FileFactKind.Audio, 1,
                FileFactState.Indexed, DurationMilliseconds: 1200, ChannelCount: 2);
            await facts.PublishAsync(observation);
            var other = new CatalogEntryIdentity("fixture", "0000000000000002");
            await facts.PublishAsync(observation with { Identity = other, Source = (await facts.CaptureAsync(other))!, ChannelCount = null });
            var reopened = await new FileFactDatabase(path).ReadCurrentAsync(identity, FileFactKind.Audio, 1);
            TestAssert.Equal(2, reopened!.ChannelCount, "audio channels survive reopening");
            var filter = new FileFactQueryFilter(FileFactKind.Audio, 1);
            var query = new CatalogV2Query("", [], CatalogQueryScope.AllVolumes(), null, CatalogEntryType.File, 1, null, filter);
            var first = await catalog.QueryAsync(query);
            TestAssert.True(first.Next is not null, "duration-only facts participate in keyset pagination");
            TestAssert.Equal(other, (await catalog.QueryAsync(query with { After = first.Next })).Items.Single().Identity, "audio second page");
            TestAssert.Equal(1, (await catalog.QueryAsync(query with { Facts = filter with { ChannelRanges = [new(2, 2)] } })).Items.Count, "unknown channels do not match known stereo");
            TestAssert.Equal(0, (await catalog.QueryAsync(query with { Facts = filter with { ChannelRanges = [new(1, 1), new(3)] } })).Items.Count, "disjoint channel choices exclude stereo");
            TestAssert.Equal(0, (await catalog.QueryAsync(query with { Facts = filter with { ChannelRanges = [new(2, 2)], MinimumDurationMilliseconds = 1201 } })).Items.Count, "duration intersects channel union");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { Width = 1, Height = 1 }), "audio dimensions rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { ChannelCount = 0 }), "zero channels rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { State = FileFactState.Failed, DurationMilliseconds = null }), "failed fact cannot retain channels");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(query with { Facts = filter with { MinimumWidth = 1 } }), "audio visual filters rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(query with { Facts = filter with { ChannelRanges = [] } }), "empty channel selection rejected");
            var revision = await facts.ReadRevisionAsync();
            await ExecuteAsync(path, "CREATE TRIGGER abort_audio_details BEFORE INSERT ON file_fact_audio_details BEGIN SELECT RAISE(ABORT,'test failure'); END;");
            await TestAssert.ThrowsAsync<SqliteException>(() => facts.PublishAsync(observation with { DurationMilliseconds = 2400, ChannelCount = 1 }), "audio detail failure rolls back duration");
            TestAssert.Equal(1200L, (await facts.ReadCurrentAsync(identity, FileFactKind.Audio, 1))!.DurationMilliseconds, "duration rollback");
            TestAssert.Equal(revision, await facts.ReadRevisionAsync(), "revision rollback");
            await ExecuteAsync(path, "DROP TRIGGER abort_audio_details;");
            await facts.InvalidateContentAsync(identity);
            TestAssert.True(await facts.ReadCurrentAsync(identity, FileFactKind.Audio, 1) is null, "source changes invalidate audio details");
            TestAssert.Equal(0, (await catalog.QueryAsync(query with { Facts = filter with { ChannelRanges = [new(2, 2)] } })).Items.Count, "stale channels never match");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }

    private static async Task ExecuteAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; await command.ExecuteNonQueryAsync();
    }
}
