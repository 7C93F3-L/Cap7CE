using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host;
using Cap7CE.Core.Reader.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogFactRecoveryTests
{
    public static async Task RunAsync()
    {
        await RunScenarioAsync();
        await RunScenarioAsync(replacedJournal: true);
        await RunScenarioAsync(force: true);
        await RunScenarioAsync(interrupted: true);
        await RunScenarioAsync(cancelled: true);
        await RunScenarioAsync(noUsn: true);
        await RunScenarioAsync(publicationFailure: true);
        await RunScenarioAsync(changedDuringBuild: true);
        await RunScenarioAsync(journalLostDuringBuild: true);
        Console.WriteLine("Checkpoint-expiry fact retention, freshness rejection, evidence, fallback and cancellation passed.");
    }

    private static async Task RunScenarioAsync(bool replacedJournal = false, bool force = false, bool interrupted = false, bool cancelled = false, bool noUsn = false, bool publicationFailure = false, bool changedDuringBuild = false, bool journalLostDuringBuild = false)
    {
        using var fixture = new TemporaryCatalogFixture();
        var catalog = new CatalogV2Database(fixture.DatabasePath); await catalog.InitializeAsync();
        var facts = new FileFactDatabase(fixture.DatabasePath); await facts.InitializeAsync();
        await using (var db = new SqliteConnection($"Data Source={fixture.DatabasePath};Pooling=False"))
        {
            await db.OpenAsync(); using var command = db.CreateCommand(); command.CommandText = """
                INSERT INTO catalog_volumes_v2 VALUES('recovery','E:','NTFS',1,'0000000000000001',100,0,0,'ready',13,13,0);
                INSERT INTO catalog_nodes_v2 VALUES('recovery','0000000000000005','0000000000000005','.','',1,16,1,NULL,1,2);
                INSERT INTO catalog_directory_paths_v2 VALUES('recovery','0000000000000005','');
                """;
            for (var i = 16; i < 29; i++) command.CommandText += $"INSERT INTO catalog_nodes_v2 VALUES('recovery','{i:X16}','0000000000000005','sample{i}.png','.png',0,32,1,10,1,2);";
            await command.ExecuteNonQueryAsync();
        }
        CatalogEntryIdentity Id(int i) => new("recovery", i.ToString("X16"));
        for (var i = 16; i < 29; i++)
        {
            var source = (await facts.CaptureAsync(Id(i)))!;
            var metrics = FileFactImageMetrics.Names.ToDictionary(name => name, _ => 0);
            await facts.PublishAsync(new(Id(i), source, FileFactKind.ImageDimensions, i == 16 ? 2 : 3, FileFactState.Indexed,
                Width: 640, Height: 480, VisualProperties: metrics, SearchEvidence: [new("visual_content", "retainedprompt")]));
        }
        await facts.InvalidateContentAsync(Id(23));
        await using (var db = new SqliteConnection($"Data Source={fixture.DatabasePath};Pooling=False"))
        {
            await db.OpenAsync(); using var command = db.CreateCommand();
            command.CommandText = "UPDATE file_facts SET volume_epoch=99 WHERE file_reference='0000000000000016';";
            await command.ExecuteNonQueryAsync();
        }
        if (interrupted) { await catalog.MarkNeedsRebuildAsync("recovery"); await catalog.BeginBuildAsync("recovery", "0000000000000001", 200, 150, 0, null, true); }
        async Task BeforeRead()
        {
            if (changedDuringBuild) await facts.InvalidateContentAsync(Id(16));
            if (!publicationFailure) return;
            await using var db = new SqliteConnection($"Data Source={fixture.DatabasePath};Pooling=False");
            await db.OpenAsync(); using var command = db.CreateCommand();
            command.CommandText = "UPDATE catalog_volumes_v2 SET catalog_revision=catalog_revision+1 WHERE volume_id='recovery';";
            await command.ExecuteNonQueryAsync();
        }
        var reader = new RecoveryReader(replacedJournal ? 2UL : 1UL, cancelled, noUsn, BeforeRead, journalLostDuringBuild);
        try
        {
            await new CatalogSynchronizationService(catalog, reader).SynchronizeAsync(["recovery"], force);
            TestAssert.False(cancelled || publicationFailure || journalLostDuringBuild, "cancelled or superseded snapshot must fail");
        }
        catch (OperationCanceledException) when (cancelled) { }
        catch (CatalogConcurrencyException) when (publicationFailure) { }
        catch (CatalogReaderDiscontinuityException) when (journalLostDuringBuild) { }
        var query = new CatalogV2Query("", [], CatalogQueryScope.AllVolumes(), null, CatalogEntryType.File, 100, null,
            new(FileFactKind.ImageDimensions, 3));
        var expected = replacedJournal || force || interrupted || cancelled || noUsn || publicationFailure || changedDuringBuild || journalLostDuringBuild ? 0 : 1;
        TestAssert.Equal(expected, (await catalog.QueryAsync(query)).Items.Count, "only proven unchanged, formerly current facts survive");
        TestAssert.Equal(expected, (await catalog.QueryAsync(query with { Query = "retainedprompt", TextTarget = CatalogQueryTextTarget.NamePathOrKeywords })).Items.Count, "search evidence follows recovered facts");
        TestAssert.Equal(expected, (await catalog.QueryAsync(query with { Facts = query.Facts! with { VisualGroups = [new([[new("brightnessMean", "<=", 10000)]])] } })).Items.Count, "colors survive with source guards");
        TestAssert.Equal(0, Directory.GetFiles(System.IO.Path.GetDirectoryName(fixture.DatabasePath)!, "*.snapshot-*.db").Length, "all recovery staging files are retired");
    }

    private sealed class RecoveryReader(ulong journal, bool cancelled, bool noUsn, Func<Task> beforeRead, bool journalLostDuringBuild) : ICatalogReaderSessionFactory, ICatalogReaderSession
    {
        private int inspections;
        private static readonly CatalogReaderVolume Volume = new(new(1, 5), "recovery", "E:", true);
        public Task<ICatalogReaderSession> ConnectAsync(CancellationToken token) => Task.FromResult<ICatalogReaderSession>(this);
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
        public Task<IReadOnlyList<CatalogReaderVolume>> ListVolumesAsync(CancellationToken token) => Task.FromResult<IReadOnlyList<CatalogReaderVolume>>([Volume]);
        public Task<CatalogReaderInspection> InspectAsync(CatalogReaderVolume volume, CancellationToken token) => Task.FromResult(new CatalogReaderInspection(14, journalLostDuringBuild && ++inspections > 1 ? journal + 1 : journal, 150, 0, 200));
        public Task<CatalogReaderSnapshot> OpenSnapshotAsync(CatalogReaderVolume volume, CancellationToken token) => Task.FromResult(new CatalogReaderSnapshot(new(1, 2), 14, journal, 200));
        public Task CloseSnapshotAsync(ReaderOpaqueId snapshot, CancellationToken token) => Task.CompletedTask;
        public Task<CatalogReaderJournalPage> ReadJournalPageAsync(CatalogReaderVolume volume, ulong id, long start, uint limit, CancellationToken token) => throw new NotSupportedException();
        public async Task<CatalogReaderSnapshotPage> ReadSnapshotPageAsync(ReaderOpaqueId snapshot, ulong cursor, uint limit, CancellationToken token)
        {
            if (cancelled) throw new OperationCanceledException();
            await beforeRead();
            List<ReaderMftRecordV2> nodes = [new(5, 5, null, 1, 2, 16, true, ".", "", 1)];
            for (var i = 16; i < 29; i++)
            {
                if (i == 26) continue; // Deleted from the rebuilt snapshot.
                nodes.Add(new((ulong)i, 5, i == 28 ? 11UL : 10UL, i == 20 ? 9 : 1, i == 19 ? 9 : 2,
                    i == 27 ? 0x400u : 32u, false, $"sample{i}.png", i == 21 ? ".jpg" : ".png",
                    i switch { 17 => 100, 18 => null, 24 => 0, 25 => 160, _ => 99 }));
            }
            if (noUsn) nodes = nodes.Select(node => node with { LastUsn = null }).ToList();
            return new CatalogReaderSnapshotPage((ulong)nodes.Count, true, nodes);
        }
    }
}
