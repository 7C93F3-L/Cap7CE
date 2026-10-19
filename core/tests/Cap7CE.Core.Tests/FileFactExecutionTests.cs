using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Host.MetadataWorkers;
using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;
using Microsoft.Data.Sqlite;
using System.Text.Json;

namespace Cap7CE.Core.Tests;

internal static class FileFactExecutionTests
{
    public static NodeMetadataResources Resources => new(Path.GetFullPath("artifacts/metadata-worker/v1"),
        Path.GetFullPath("native/artifacts/metadata-media/v1/Cap7CE.Media.Metadata.exe"));
    public static async Task RunAsync()
    {
        if (!OperatingSystem.IsWindows()) return;
        await using (var fixture = await Fixture.CreateAsync(new NodeMetadataWorker(Resources))) {
            await using (var projection = new ProductCoreRuntime(new CatalogV2Database(fixture.Database), new NoReader(),
                new(fixture.Database, contentReader: new ControlledReader()))) {
                var dispatcher = new CoreRequestDispatcher(projection, new ProductSearchCursorCodec());
                var response = await dispatcher.DispatchAsync(new(1, "metadata-capability", CoreOperations.CapabilityStatus, 5000,
                    CoreProtocolJson.ToElement(new { })), CancellationToken.None);
                var capability = response.Body!.Value.Deserialize<CapabilityStatusResponse>(CoreProtocolJson.Options)!;
                TestAssert.True(capability.ReadsFileContent && !capability.WritesSourceVolumes && !capability.UsesNetwork,
                    "assembled ordinary content capability is described accurately without granting a task");
            }
            await TestAssert.ThrowsAsync<CoreProtocolException>(() => fixture.Session.ExecuteAsync(new(new('a', 32)), CancellationToken.None),
                "ungranted execution cannot start content reading");
            await fixture.ConfigureAsync();
            var ticket = await fixture.ClaimAsync(1);
            var result = await fixture.Session.ExecuteAsync(new(ticket.Lease.LeaseId), CancellationToken.None);
            TestAssert.Equal(FileFactBrokerCompletion.Published, result.Completion, "Core executes and publishes its owned lease");
            var fact = await new FileFactDatabase(fixture.Database).ReadCurrentAsync(fixture.Identity, FileFactKind.TextData, 1);
            TestAssert.Equal(6L, fact!.TextDataProperties!.CharacterCount!.Value, "real independent Node result reaches Core facts");
            TestAssert.Equal("你好\nend", await File.ReadAllTextAsync(fixture.Source), "actual decoder preserves source bytes");
            TestAssert.Equal(FileFactBrokerCompletion.LeaseLost,
                (await fixture.Session.ExecuteAsync(new(ticket.Lease.LeaseId), CancellationToken.None)).Completion, "execution cannot replay a consumed lease");
        }
        var reader = new ControlledReader();
        await using (var fixture = await Fixture.CreateAsync(reader)) {
            await fixture.ConfigureAsync();
            TestAssert.Equal(FileFactBrokerCompletion.LeaseLost,
                (await fixture.Session.ExecuteAsync(new(new('b', 32)), CancellationToken.None)).Completion, "unowned token never reaches decoder");
            TestAssert.Equal(0, reader.Reads, "missing token does not read a path");
            var ticket = await fixture.ClaimAsync(1);
            await File.AppendAllTextAsync(fixture.Source, " changed");
            await fixture.Session.ExecuteAsync(new(ticket.Lease.LeaseId), CancellationToken.None);
            TestAssert.Equal(0, reader.Reads, "changed source is rejected immediately before extraction");
        }
        reader = new ControlledReader { Block = true };
        await using (var fixture = await Fixture.CreateAsync(reader)) {
            await fixture.ConfigureAsync();
            var ticket = await fixture.ClaimAsync(1);
            var work = fixture.Session.ExecuteAsync(new(ticket.Lease.LeaseId), CancellationToken.None);
            await reader.Entered.Task.WaitAsync(TimeSpan.FromSeconds(3));
            await fixture.Session.PauseAsync(CancellationToken.None);
            await TestAssert.ThrowsAsync<OperationCanceledException>(() => work, "pause cancels the Core-owned decoder before returning");
            TestAssert.Equal(0, reader.Live, "pause leaves no live content execution");
            TestAssert.True(await new FileFactDatabase(fixture.Database).ReadCurrentAsync(fixture.Identity, FileFactKind.TextData, 1) is null,
                "cancelled decoder cannot publish");
        }
        reader = new ControlledReader();
        await using (var fixture = await Fixture.CreateAsync(reader)) {
            await fixture.ConfigureAsync(); var ticket = await fixture.ClaimAsync(1);
            reader.BeforeReturn = () => File.AppendAllTextAsync(fixture.Source, " changed during decoding");
            TestAssert.Equal(FileFactBrokerCompletion.SourceDeferred,
                (await fixture.Session.ExecuteAsync(new(ticket.Lease.LeaseId), CancellationToken.None)).Completion,
                "source is checked again after decoding");
            TestAssert.True(await new FileFactDatabase(fixture.Database).ReadCurrentAsync(fixture.Identity, FileFactKind.TextData, 1) is null,
                "changed source cannot publish plausible decoder output");
        }
        reader = new ControlledReader { Fault = "metadata-worker-exited" };
        await using (var fixture = await Fixture.CreateAsync(reader)) {
            await fixture.ConfigureAsync();
            for (var version = 1; version <= 3; version++) {
                var ticket = await fixture.ClaimAsync(version);
                if (version < 3) TestAssert.Equal("failed", (await fixture.Session.ExecuteAsync(new(ticket.Lease.LeaseId), CancellationToken.None)).State!,
                    "isolated crashes become versioned failure observations");
                else await TestAssert.ThrowsAsync<CoreProtocolException>(() => fixture.Session.ExecuteAsync(new(ticket.Lease.LeaseId), CancellationToken.None),
                    "third consecutive process failure stops before caching that source");
            }
            TestAssert.True(await new FileFactDatabase(fixture.Database).ReadCurrentAsync(fixture.Identity, FileFactKind.TextData, 3) is null,
                "environmental failure leaves third source retryable");
            await fixture.Session.PauseAsync(CancellationToken.None);
            reader.Fault = null; await fixture.ConfigureAsync();
            var retry = await fixture.ClaimAsync(3);
            TestAssert.Equal(FileFactBrokerCompletion.Published,
                (await fixture.Session.ExecuteAsync(new(retry.Lease.LeaseId), CancellationToken.None)).Completion, "new grant recovers failed environment");
        }
        Console.WriteLine("Core content execution: owned lease, real Node publication, source revalidation, pause and bounded crash recovery passed.");
    }
    private sealed class ControlledReader : IFileFactContentReader
    {
        public int Reads, Live; public bool Block; public string? Fault;
        public Func<Task>? BeforeReturn;
        public TaskCompletionSource Entered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public async Task<FileFactExtractionResult> ReadAsync(FileFactExtractionTicket ticket, CancellationToken token)
        {
            Reads++; Live++; Entered.TrySetResult();
            try { if (Block) await Task.Delay(Timeout.Infinite, token);
                if (Fault is not null) throw new FileFactWorkerException(Fault);
                if (BeforeReturn is not null) await BeforeReturn();
                return new(FileFactState.Indexed, TextDataProperties: new("text", 6, 2)); }
            finally { Live--; }
        }
        public Task ReleaseAsync() => Task.CompletedTask;
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
    private sealed class NoReader : ICatalogReaderSessionFactory
    {
        public Task<ICatalogReaderSession> ConnectAsync(CancellationToken token) => throw new InvalidOperationException("Content execution never starts Reader.");
    }
    internal sealed class Fixture(string root, CatalogEntryIdentity identity, FileFactHostSession session) : IAsyncDisposable
    {
        public string Source => Path.Combine(root, "源.txt");
        public string Database => Path.Combine(root, "fixture.db");
        public CatalogEntryIdentity Identity => identity;
        public FileFactHostSession Session => session;
        public Task ConfigureAsync() => Session.ConfigureAsync(new(true, new([identity.VolumeId], [new(identity.VolumeId)], [])), CancellationToken.None);
        public async Task<FileFactExtractionTicket> ClaimAsync(int version)
        {
            await Session.DiscoverAsync(new(FileFactKind.TextData, version, [".txt"]), CancellationToken.None);
            return (await Session.ClaimAsync(CancellationToken.None, new([new(FileFactKind.TextData, version)], identity.VolumeId))).Ticket!;
        }
        public static async Task<Fixture> CreateAsync(IFileFactContentReader reader)
        {
            var root = Path.Combine(Path.GetTempPath(), "Cap7CE-core-execution-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(root);
            var source = Path.Combine(root, "源.txt"); var database = Path.Combine(root, "fixture.db");
            await File.WriteAllTextAsync(source, "你好\nend");
            var native = NativeFileFactSourceGuard.Capture(source)!;
            await new CatalogV2Database(database).InitializeAsync();
            await using var connection = new SqliteConnection($"Data Source={database};Pooling=False"); await connection.OpenAsync();
            using var command = connection.CreateCommand();
            command.CommandText = """
                INSERT INTO catalog_volumes_v2 VALUES($volume,$drive,'NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                INSERT INTO catalog_nodes_v2 VALUES($volume,'0000000000000001',NULL,'fixture','',1,16,1,0,1,1);
                INSERT INTO catalog_directory_paths_v2 VALUES($volume,'0000000000000001',$relative);
                INSERT INTO catalog_nodes_v2 VALUES($volume,$reference,'0000000000000001','源.txt','.txt',0,32,1,$size,1,$modified);
                """;
            command.Parameters.AddWithValue("$volume", native.Identity.VolumeId); command.Parameters.AddWithValue("$drive", Path.GetPathRoot(source)![..2]);
            command.Parameters.AddWithValue("$relative", root[3..]); command.Parameters.AddWithValue("$reference", native.Identity.FileReference);
            command.Parameters.AddWithValue("$size", native.SizeBytes); command.Parameters.AddWithValue("$modified", native.ModifiedFileTime);
            await command.ExecuteNonQueryAsync();
            return new(root, native.Identity, new(database, contentReader: reader));
        }
        public async ValueTask DisposeAsync() { await Session.DisposeAsync(); SqliteConnection.ClearAllPools(); Directory.Delete(root, recursive: true); }
    }
}
