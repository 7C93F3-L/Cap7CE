using Cap7CE.Core.Catalog;
using Cap7CE.Core.Host;
using Cap7CE.Core.Host.CatalogMaintenance;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogChangeSignalTests
{
    public static async Task RunAsync()
    {
        var signal = new CatalogChangeSignal(); signal.PublishCatalog(5); var sequence = signal.Snapshot.Sequence;
        var timeout = await signal.WaitAsync(new(sequence, 1), CancellationToken.None);
        TestAssert.False(timeout.Changed, "quiet signal wait returns cached state unchanged");
        signal.PublishCatalog(4); TestAssert.Equal(sequence, signal.Snapshot.Sequence, "older publication cannot regress data revision or wake again");
        var one = signal.WaitAsync(new(sequence, 1000), CancellationToken.None);
        var two = signal.WaitAsync(new(sequence, 1000), CancellationToken.None);
        signal.SetState("watching");
        TestAssert.True((await one).Changed && (await two).Changed, "one lifecycle event wakes all existing signal observers");
        TestAssert.Equal(5L, (await one).CatalogRevision, "lifecycle events retain independent data revision");
        TestAssert.True((await signal.WaitAsync(new(99, 1), CancellationToken.None)).Changed, "client sequence from a retired instance resets immediately");
        using var canceled = new CancellationTokenSource(); canceled.Cancel();
        await TestAssert.ThrowsAsync<OperationCanceledException>(() => signal.WaitAsync(new(signal.Snapshot.Sequence), canceled.Token), "pre-cancelled wait never subscribes");
        await TestAssert.ThrowsAsync<ArgumentException>(() => signal.WaitAsync(new(-1), CancellationToken.None), "negative wait sequence refused");
        await TestAssert.ThrowsAsync<ArgumentException>(() => signal.WaitAsync(new(0, 25001), CancellationToken.None), "unbounded wait refused");

        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-notification-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
        try {
            var path = Path.Combine(root, "fixture.db"); var catalog = new CatalogV2Database(path); var native = new NoReader();
            await using var runtime = new ProductCoreRuntime(catalog, native); await runtime.InitializeAsync();
            var dispatcher = new CoreRequestDispatcher(runtime, new ProductSearchCursorCodec());
            TestAssert.False(dispatcher.Capabilities.Contains(CoreOperations.CatalogAwaitChanges), "unassembled monitoring does not advertise an await interface");
            await runtime.ActivateMaintenanceAsync((ready, token) => Task.FromResult<IReadOnlyList<FileFactOwnedStorageRoot>>([]));
            // Wait for idle startup through the cached signal, never a status poll.
            for (var step = 0; step < 5 && runtime.ChangeSignal.Snapshot.State != "idle"; step++)
                await runtime.ChangeSignal.WaitAsync(new(runtime.ChangeSignal.Snapshot.Sequence, 1000), CancellationToken.None);
            TestAssert.Equal("idle", runtime.ChangeSignal.Snapshot.State, "no selected ready volume leaves maintenance idle");
            TestAssert.Equal(0, native.Connects, "idle activation does not start a native Reader");
            TestAssert.True(dispatcher.Capabilities.Contains(CoreOperations.CatalogAwaitChanges), "assembled monitor advertises its optional wait capability");
            var number = 0;
            async Task<CoreResponseEnvelope> Send(string operation, object body, int deadline = 30_000, CancellationToken token = default) {
                var request = new CoreRequestEnvelope(1, "notify-" + ++number, operation, deadline, CoreProtocolJson.ToElement(body));
                using var wire = new MemoryStream(); await LengthPrefixedJsonFrame.WriteAsync(wire, request, token); wire.Position = 0;
                return await dispatcher.DispatchAsync((await LengthPrefixedJsonFrame.ReadAsync<CoreRequestEnvelope>(wire, token))!, token);
            }
            var after = runtime.ChangeSignal.Snapshot.Sequence;
            var pending = Send(CoreOperations.CatalogAwaitChanges, new CatalogAwaitChangesRequest(after));
            TestAssert.False(pending.IsCompleted, "long wait remains pending before an event");
            var duplicate = await Send(CoreOperations.CatalogAwaitChanges, new CatalogAwaitChangesRequest(after));
            TestAssert.Equal(CoreErrorCodes.InvalidRequest, duplicate.Error!.Code, "a second wait cannot consume another execution lane");
            var foreground = await Task.WhenAll(Send(CoreOperations.CatalogStatus, new { }), Send(CoreOperations.SearchStart,
                new SearchStartRequest("", 10, CoreSearchSorts.NameAscending, [])));
            TestAssert.True(foreground.All(response => response.Status == CoreResponseStatuses.Success), "status and real Catalog search still execute while notification waits");
            var cancel = await Send(CoreOperations.SearchCancel, new SearchCancelRequest("notify-1"));
            TestAssert.True(ProtocolClient.ReadBody<SearchCancelResponse>(cancel).Accepted, "wait uses the existing targeted cancellation protocol");
            TestAssert.Equal(CoreErrorCodes.Cancelled, (await pending).Error!.Code, "targeted wait cancellation releases its lane");
            var wake = Send(CoreOperations.CatalogAwaitChanges, new CatalogAwaitChangesRequest(after));
            runtime.ChangeSignal.PublishCatalog(10);
            TestAssert.Equal(10L, ProtocolClient.ReadBody<CatalogChangeNotice>(await wake).CatalogRevision, "cached publication reaches typed framed response");
            var invalid = await Send(CoreOperations.CatalogAwaitChanges, new CatalogAwaitChangesRequest(0, 100), 100);
            TestAssert.Equal(CoreErrorCodes.InvalidRequest, invalid.Error!.Code, "wait must finish before its request deadline");
            using var session = new CancellationTokenSource();
            var disconnected = Send(CoreOperations.CatalogAwaitChanges, new CatalogAwaitChangesRequest(runtime.ChangeSignal.Snapshot.Sequence), token: session.Token);
            session.Cancel(); TestAssert.Equal(CoreErrorCodes.Cancelled, (await disconnected).Error!.Code, "session cancellation retires its signal wait");
            var quiet = ProtocolClient.ReadBody<CatalogChangeNotice>(await Send(CoreOperations.CatalogAwaitChanges, new CatalogAwaitChangesRequest(runtime.ChangeSignal.Snapshot.Sequence, 1)));
            TestAssert.False(quiet.Changed, "retired wait lane can be reused for quiet timeout");
            await using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
            using var command = connection.CreateCommand(); command.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE name='file_fact_state';";
            TestAssert.Equal(0L, Convert.ToInt64(await command.ExecuteScalarAsync()), "monitoring and notification never activate metadata facts without consent");
            await runtime.ShutdownAsync(); TestAssert.Equal("stopped", runtime.ChangeSignal.Snapshot.State, "shutdown notifies cached terminal state");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
    private sealed class NoReader : ICatalogReaderSessionFactory
    {
        public int Connects { get; private set; }
        public Task<ICatalogReaderSession> ConnectAsync(CancellationToken token) { Connects++; throw new InvalidOperationException("No ready fixture volume should connect."); }
    }
}
