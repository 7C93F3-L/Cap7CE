using System.Diagnostics;
using System.Reflection;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host;
using Cap7CE.Core.Host.CatalogMaintenance;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Reader.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogFactRestartTests
{
    private static readonly CatalogEntryIdentity Identity = new("restart", "0000000000000010");
    public static async Task RunAsync()
    {
        foreach (var entries in new[] { false, true })
        {
            foreach (var failure in new[] { "cancel", "read-error", "publish-error", "transaction-error", "crash" })
                await RunScenarioAsync(failure, entries);
            foreach (var change in new[] { "force", "journal", "lowest", "content", "epoch", "size", "no-usn" })
                await RunScenarioAsync("cancel", entries, change);
        }
        await CheckSourceFencesAsync();
        Console.WriteLine("Fact recovery restart: repeated cancellation, read/publication failure, abrupt child exit and startup monitor preserve verified colors/search; changed sources remain invalid.");
    }

    private static async Task CheckSourceFencesAsync()
    {
        using var first = new TemporaryCatalogFixture(); using var second = new TemporaryCatalogFixture();
        var a = new CatalogV2Database(first.DatabasePath); var b = new CatalogV2Database(second.DatabasePath);
        await SeedAsync(a, false); await SeedAsync(b, false);
        await using (var foreign = await CatalogFactRecovery.CaptureAsync(a, (await a.ReadVolumeAsync("restart"))!))
        {
            await TestAssert.ThrowsAsync<CatalogStateTransitionException>(() => b.BeginRetainedSnapshotBuildAsync("restart", "0000000000000001", 200, 150, 0, 2, foreign!),
                "evidence from a different catalog cannot authorize retained staging");
        }
        await AssertVisibleAsync(b, 1);
        var facts = new FileFactDatabase(first.DatabasePath);
        var reader = new Reader { BeforeRead = () => facts.InvalidateVolumeAsync("restart") };
        await TestAssert.ThrowsAsync<CatalogConcurrencyException>(() => new CatalogSynchronizationService(a, reader).SynchronizeAsync(["restart"], false),
            "invalidation during staging must reject publication");
        TestAssert.Equal(1L, await ScalarAsync(first.DatabasePath, "SELECT epoch FROM file_fact_volumes;"), "rejected publication adds no invalidation beyond the concurrent writer");
        TestAssert.Equal(100L, (await a.ReadVolumeAsync("restart"))!.CheckpointUsn!.Value, "rejected publication keeps the source checkpoint");
        await new CatalogSynchronizationService(a, new Reader()).SynchronizeAsync(["restart"], false);
        await AssertVisibleAsync(a, 0);
    }

    private static async Task RunScenarioAsync(string failure, bool entries, string? change = null)
    {
        using var fixture = new TemporaryCatalogFixture(); var path = fixture.DatabasePath;
        var catalog = new CatalogV2Database(path); await SeedAsync(catalog, entries);
        var facts = new FileFactDatabase(path); var reader = new Reader();
        if (failure == "crash") await CrashAsync(path, entries);
        else
        {
            for (var attempt = 0; attempt < 2; attempt++)
            {
                reader.BeforeRead = async () =>
                {
                    if (failure == "cancel") throw new OperationCanceledException();
                    if (failure == "read-error") throw new IOException("fixture-read-failure");
                    await SqlAsync(path, failure == "transaction-error"
                        ? "CREATE TRIGGER IF NOT EXISTS reject_snapshot BEFORE INSERT ON catalog_nodes_v2 BEGIN SELECT RAISE(ABORT, 'fixture-publication-failure'); END;"
                        : "UPDATE catalog_volumes_v2 SET catalog_revision=catalog_revision+1;");
                };
                try { await new CatalogSynchronizationService(catalog, reader, captureFileEntries: entries).SynchronizeAsync(["restart"], false); throw new Exception("Expected interruption"); }
                catch (OperationCanceledException) when (failure == "cancel") { }
                catch (IOException) when (failure == "read-error") { }
                catch (CatalogConcurrencyException) when (failure == "publish-error") { }
                catch (SqliteException) when (failure == "transaction-error") { }
                await AssertRetainedAsync(catalog, path);
                catalog = new CatalogV2Database(path); await catalog.InitializeAsync(createEntryCatalog: entries);
            }
        }
        catalog = new CatalogV2Database(path); await catalog.InitializeAsync(createEntryCatalog: entries);
        await AssertRetainedAsync(catalog, path); await SqlAsync(path, "DROP TRIGGER IF EXISTS reject_snapshot;"); reader.BeforeRead = () => Task.CompletedTask;
        if (change == "content") await facts.InvalidateContentAsync(Identity);
        if (change == "epoch") await facts.InvalidateVolumeAsync(Identity.VolumeId);
        if (change == "size") reader.Size = 11;
        if (change == "journal") reader.Journal = 2;
        if (change == "lowest") reader.Lowest = 150;
        if (change == "no-usn") reader.FileUsn = null;
        if (change is not null)
            await new CatalogSynchronizationService(catalog, reader, captureFileEntries: entries).SynchronizeAsync(["restart"], change == "force");
        else await ResumeMonitorAsync(catalog, reader, entries);
        var expected = change is null ? 1 : 0;
        TestAssert.Equal(CatalogV2VolumeState.Ready, (await catalog.ReadVolumeAsync("restart"))!.State, "restart completes its snapshot");
        await AssertVisibleAsync(catalog, expected);
        if (expected == 1) TestAssert.Equal(1L, await ScalarAsync(path, "SELECT epoch FROM file_fact_volumes;"), "only successful publication advances epoch");
        TestAssert.True(await catalog.CheckIntegrityAsync(), "recovery preserves catalog integrity");
        TestAssert.Equal(0, Directory.GetFiles(Path.GetDirectoryName(path)!, "*.snapshot-*.db").Length, "staging is retired after restart");
    }

    private static async Task SeedAsync(CatalogV2Database catalog, bool entries)
    {
        await catalog.InitializeAsync(createEntryCatalog: entries); var path = catalog.DatabasePath;
        var facts = new FileFactDatabase(path); await facts.InitializeAsync();
        await SqlAsync(path, """
            INSERT INTO catalog_volumes_v2 VALUES('restart','X:','NTFS',1,'0000000000000001',100,0,0,'ready',2,2,0);
            INSERT INTO catalog_nodes_v2 VALUES('restart','0000000000000005','0000000000000005','.','',1,16,1,NULL,1,2);
            INSERT INTO catalog_nodes_v2 VALUES('restart','0000000000000010','0000000000000005','fixture.png','.png',0,32,1,10,1,2);
            INSERT INTO catalog_directory_paths_v2 VALUES('restart','0000000000000005','');
            """);
        if (entries) await new CatalogFileEntryStore(catalog).ReplaceAsync(Identity, new(1, 2, 10), 0, [new("0000000000000005", "fixture.png")]);
        var source = (await facts.CaptureAsync(Identity))!;
        await facts.PublishAsync(new(Identity, source, FileFactKind.ImageDimensions, 3, FileFactState.Indexed, Width: 640, Height: 480,
            VisualProperties: FileFactImageMetrics.Names.ToDictionary(name => name, _ => 0), SearchEvidence: [new("visual_content", "retainedprompt")]));
        await AssertVisibleAsync(catalog, 1);
    }

    private static async Task AssertRetainedAsync(CatalogV2Database catalog, string path)
    {
        var volume = (await catalog.ReadVolumeAsync("restart"))!;
        TestAssert.Equal(CatalogV2VolumeState.CatchingUp, volume.State, "interrupted automatic snapshot retains a resumable state");
        TestAssert.Equal(100L, volume.CheckpointUsn!.Value, "old checkpoint survives interruption");
        TestAssert.Equal(0L, await ScalarAsync(path, "SELECT COALESCE(MAX(epoch),0) FROM file_fact_volumes;"), "interruption does not invalidate facts");
        TestAssert.Equal(1L, await ScalarAsync(path, "SELECT COUNT(*) FROM catalog_embedded_search;"), "search evidence survives interruption");
        TestAssert.Equal(1L, await ScalarAsync(path, "SELECT COUNT(*) FROM file_fact_image_details WHERE properties_present=1;"), "colors survive interruption");
        await AssertVisibleAsync(catalog, 0); // Retained data is not queryable until source verification and publication.
    }

    private static async Task AssertVisibleAsync(CatalogV2Database catalog, int expected)
    {
        var query = new CatalogV2Query("", [], CatalogQueryScope.AllVolumes(), null, CatalogEntryType.File, 100, null,
            new(FileFactKind.ImageDimensions, 3));
        TestAssert.Equal(expected, (await catalog.QueryAsync(query)).Items.Count, "dimensions follow verified source");
        TestAssert.Equal(expected, (await catalog.QueryAsync(query with { Query = "retainedprompt", TextTarget = CatalogQueryTextTarget.NamePathOrKeywords })).Items.Count, "search follows verified source");
        TestAssert.Equal(expected, (await catalog.QueryAsync(query with { Facts = query.Facts! with { VisualGroups = [new([[new("brightnessMean", "<=", 10000)]])] } })).Items.Count, "colors follow verified source");
    }

    private static async Task ResumeMonitorAsync(CatalogV2Database catalog, Reader source, bool entries)
    {
        var reader = new WaitingCatalogReader(source); using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var monitor = new CatalogJournalMonitor(catalog, reader, (_, _) => Task.FromResult<IReadOnlyList<FileFactOwnedStorageRoot>>([]), _ => { }, captureFileEntries: entries);
        var work = monitor.RunAsync(stop.Token); var ready = reader.Waits.Reader.ReadAsync(stop.Token).AsTask();
        try { if (await Task.WhenAny(work, ready) == work) await work; else await ready; }
        finally { stop.Cancel(); try { await work; } catch (OperationCanceledException) when (stop.IsCancellationRequested) { } }
        TestAssert.Equal(0, reader.Active, "restart releases its Reader");
    }

    private static async Task CrashAsync(string path, bool entries)
    {
        var executable = Environment.ProcessPath!;
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true, RedirectStandardOutput = true };
        if (Path.GetFileNameWithoutExtension(executable).Equals("dotnet", StringComparison.OrdinalIgnoreCase)) start.ArgumentList.Add(Assembly.GetExecutingAssembly().Location);
        start.ArgumentList.Add("--fact-recovery-crash-worker"); start.ArgumentList.Add(path); start.ArgumentList.Add(entries.ToString());
        using var child = Process.Start(start)!;
        try { await child.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(15)); }
        finally { if (!child.HasExited) { child.Kill(true); await child.WaitForExitAsync(); } }
        TestAssert.Equal(73, child.ExitCode, "worker exits abruptly after entering retained recovery");
    }

    public static async Task CrashWorkerAsync(string path, bool entries)
    {
        var testRoot = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "Cap7CE-Core-Catalog-Tests")) + Path.DirectorySeparatorChar;
        if (!Path.GetFullPath(path).StartsWith(testRoot, StringComparison.OrdinalIgnoreCase) || !File.Exists(path)) throw new ArgumentException("Expected existing isolated fixture");
        await new CatalogSynchronizationService(new(path), new Reader { BeforeRead = () => { Environment.Exit(73); return Task.CompletedTask; } }, captureFileEntries: entries).SynchronizeAsync(["restart"], false);
    }

    private static async Task SqlAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection($"Data Source={path};Pooling=False"); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; await command.ExecuteNonQueryAsync();
    }
    private static async Task<long> ScalarAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection($"Data Source={path};Mode=ReadOnly;Pooling=False"); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; return Convert.ToInt64(await command.ExecuteScalarAsync());
    }

    private sealed class Reader : ICatalogReaderSessionFactory, ICatalogReaderSession
    {
        public Func<Task> BeforeRead { get; set; } = () => Task.CompletedTask;
        public ulong Journal { get; set; } = 1;
        public long Lowest { get; set; }
        public ulong Size { get; set; } = 10;
        public long? FileUsn { get; set; } = 99;
        private static readonly CatalogReaderVolume Volume = new(new(1, 5), "restart", "X:", true);
        public bool SupportsFileEntryNames => true;
        public Task<ICatalogReaderSession> ConnectAsync(CancellationToken token) => Task.FromResult<ICatalogReaderSession>(this);
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
        public Task<IReadOnlyList<CatalogReaderVolume>> ListVolumesAsync(CancellationToken token) => Task.FromResult<IReadOnlyList<CatalogReaderVolume>>([Volume]);
        public Task<CatalogReaderInspection> InspectAsync(CatalogReaderVolume volume, CancellationToken token) => Task.FromResult(new CatalogReaderInspection(2, Journal, 150, Lowest, 200));
        public Task<CatalogReaderSnapshot> OpenSnapshotAsync(CatalogReaderVolume volume, CancellationToken token) => Task.FromResult(new CatalogReaderSnapshot(new(1, 2), 2, Journal, 200));
        public Task CloseSnapshotAsync(ReaderOpaqueId snapshot, CancellationToken token) => Task.CompletedTask;
        public Task<CatalogReaderJournalPage> ReadJournalPageAsync(CatalogReaderVolume volume, ulong journal, long start, uint limit, CancellationToken token) => throw new CatalogReaderDiscontinuityException();
        public async Task<CatalogReaderSnapshotPage> ReadSnapshotPageAsync(ReaderOpaqueId snapshot, ulong cursor, uint limit, CancellationToken token)
        {
            await BeforeRead(); return new(2, true, [new(5, 5, null, 1, 2, 16, true, ".", "", 1), new(16, 5, Size, 1, 2, 32, false, "fixture.png", ".png", FileUsn)]);
        }
        public Task<IReadOnlyList<ReaderFileEntrySet>> ReadFileEntriesAsync(CatalogReaderVolume volume, IReadOnlyList<ulong> references, CancellationToken token) =>
            Task.FromResult<IReadOnlyList<ReaderFileEntrySet>>(references.Select(reference => new ReaderFileEntrySet(reference, ReaderFileEntryState.Complete, 1, Size, 1, 2, [new(5, "fixture.png")])).ToArray());
    }
}
