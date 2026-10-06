using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Host.MetadataRecovery;
using Cap7CE.Core.Protocol;
using Microsoft.Data.Sqlite;
using System.Text.Json;

namespace Cap7CE.Core.Tests;

internal static class FileFactHostSessionTests
{
    // Runs on the independent native source fixture before the broker lifecycle cases.
    public static async Task RunAsync(string path, CatalogEntryIdentity identity)
    {
        var checkpointCount = 0;
        string recovery = "";
        var session = new FileFactHostSession(path, async token =>
        {
            checkpointCount++;
            recovery = (await new FileFactRecoveryCheckpoint(path,
                Path.Combine(Path.GetDirectoryName(path)!, "metadata-recovery")).CreateBeforeActivationAsync(token))!;
        });
        await using var runtime = new ProductCoreRuntime(new CatalogV2Database(path), new NoReader(), session);
        var dispatcher = new CoreRequestDispatcher(runtime, new ProductSearchCursorCodec());
        await using var ordinary = new ProductCoreRuntime(new CatalogV2Database(path), new NoReader());
        TestAssert.False(new CoreRequestDispatcher(ordinary, new ProductSearchCursorCodec()).Capabilities.Contains(CoreOperations.FileFactConfigure),
            "production default does not advertise unassembled metadata operations");
        TestAssert.True(dispatcher.Capabilities.Contains(CoreOperations.FileFactConfigure), "injected metadata session advertises only assembled operations");
        var sequence = 0;
        async Task<CoreResponseEnvelope> SendAsync(string operation, object body)
        {
            var request = new CoreRequestEnvelope(1, "metadata-test-" + ++sequence, operation, 5000, CoreProtocolJson.ToElement(body));
            using var wire = new MemoryStream();
            await LengthPrefixedJsonFrame.WriteAsync(wire, request, CancellationToken.None);
            wire.Position = 0;
            var decoded = (await LengthPrefixedJsonFrame.ReadAsync<CoreRequestEnvelope>(wire, CancellationToken.None))!;
            var response = await dispatcher.DispatchAsync(decoded, CancellationToken.None);
            var encoded = JsonSerializer.SerializeToUtf8Bytes(response, CoreProtocolJson.Options);
            return JsonSerializer.Deserialize<CoreResponseEnvelope>(encoded, CoreProtocolJson.Options)!;
        }
        var policy = new FileFactQueuePolicy([identity.VolumeId], [new(identity.VolumeId)], []);
        var inactive = ProtocolClient.ReadBody<FileFactHostStatus>(await SendAsync(CoreOperations.FileFactStatus,
            new FileFactQueueStatusRequest(FileFactKind.ImageDimensions, 1)));
        TestAssert.Equal("inactive", inactive.State, "status before consent is read-only inactive");
        var changeRequest = new FileFactConsumeChangesRequest([new(FileFactKind.ImageDimensions, 1, [".png"])]);
        var ungrantedChanges = await SendAsync(CoreOperations.FileFactConsumeChanges, changeRequest);
        TestAssert.Equal(CoreErrorCodes.NotQueryable, ungrantedChanges.Error!.Code, "change consumption requires an active grant");
        var denied = await SendAsync(CoreOperations.FileFactConfigure, new FileFactConfigurationRequest(false, policy));
        TestAssert.Equal(CoreErrorCodes.InvalidRequest, denied.Error!.Code, "false confirmation cannot activate schema");
        var invalid = await SendAsync(CoreOperations.FileFactConfigure, new FileFactConfigurationRequest(true, policy with { VolumeOrder = [] }));
        TestAssert.Equal(CoreErrorCodes.InvalidRequest, invalid.Error!.Code, "invalid policy cannot activate schema");
        TestAssert.Equal(0, checkpointCount, "invalid requests do not start migration or checkpoint");
        TestAssert.Equal(0L, await CountFactTablesAsync(path), "status and denied activation never initialize user store");
        using var cancelled = new CancellationTokenSource();
        var cancelledCheckpointCount = 0;
        var cancelledSession = new FileFactHostSession(path, _ =>
        {
            cancelledCheckpointCount++;
            cancelled.Cancel();
            return Task.CompletedTask;
        });
        await TestAssert.ThrowsAsync<OperationCanceledException>(() => cancelledSession.ConfigureAsync(
            new(true, policy), cancelled.Token), "cancellation after recovery completion cannot initialize schema");
        TestAssert.Equal(0L, await CountFactTablesAsync(path), "cancelled activation leaves pre-metadata store intact");
        TestAssert.Equal("inactive", (await cancelledSession.ReadStatusAsync(new(FileFactKind.ImageDimensions, 1), CancellationToken.None)).State,
            "cancelled activation never reports an active worker");
        var configured = ProtocolClient.ReadBody<FileFactHostStatus>(await SendAsync(CoreOperations.FileFactConfigure,
            new FileFactConfigurationRequest(true, policy)));
        TestAssert.Equal("active", configured.State, "explicit confirmation activates session");
        TestAssert.Equal(1, checkpointCount, "recovery checkpoint precedes first activation");
        TestAssert.Equal(0L, await CountFactTablesAsync(recovery), "consistent recovery copy retains pre-metadata schema");
        var invalidChanges = await SendAsync(CoreOperations.FileFactConsumeChanges, changeRequest with { PageSize = 513 });
        TestAssert.Equal(CoreErrorCodes.InvalidRequest, invalidChanges.Error!.Code, "change consumption remains page bounded over SC1");
        await using (var connection = new SqliteConnection("Data Source=" + path)) {
            await connection.OpenAsync(); using var command = connection.CreateCommand();
            command.CommandText = "INSERT INTO file_fact_catalog_changes(volume_id,file_reference,scan_descendants) VALUES($volume,$reference,0);";
            command.Parameters.AddWithValue("$volume", identity.VolumeId); command.Parameters.AddWithValue("$reference", identity.FileReference);
            await command.ExecuteNonQueryAsync();
        }
        var consumed = ProtocolClient.ReadBody<FileFactChangeDispatchStep>(await SendAsync(CoreOperations.FileFactConsumeChanges, changeRequest));
        TestAssert.Equal(1, consumed.JobsDiscovered, "framed change consumption enqueues only the native fixture identity");
        TestAssert.True(consumed.Acknowledged, "fully enqueued hint acknowledged over SC1");
        var changedSpecification = await SendAsync(CoreOperations.FileFactConsumeChanges,
            new FileFactConsumeChangesRequest([new(FileFactKind.ImageDimensions, 2, [".png"])]));
        TestAssert.Equal(CoreErrorCodes.InvalidRequest, changedSpecification.Error!.Code, "mid-grant provider changes require explicit reconfiguration");
        var discovered = ProtocolClient.ReadBody<FileFactDiscoveryPage>(await SendAsync(CoreOperations.FileFactDiscover,
            new FileFactDiscoveryRequest(FileFactKind.ImageDimensions, 1, [".png"])));
        TestAssert.Equal(identity, discovered.Jobs.Single().Identity, "session discovers and enqueues native fixture identity");
        var wrongReader = ProtocolClient.ReadBody<FileFactClaimResult>(await SendAsync(CoreOperations.FileFactClaim,
            new FileFactClaimRequest(new([new(FileFactKind.Video, 2)], identity.VolumeId))));
        TestAssert.Equal(FileFactClaimState.Empty, wrongReader.State, "reader selection does not consume a different fact task");
        var claimedResponse = await SendAsync(CoreOperations.FileFactClaim,
            new FileFactClaimRequest(new([new(FileFactKind.ImageDimensions, 1)], identity.VolumeId)));
        var claimed = ProtocolClient.ReadBody<FileFactClaimResult>(claimedResponse);
        TestAssert.Equal(FileFactClaimState.Ready, claimed.State, "session issues verified extraction ticket");
        var sourceWire = claimedResponse.Body!.Value.GetProperty("ticket").GetProperty("lease").GetProperty("source");
        TestAssert.Equal(JsonValueKind.String, sourceWire.GetProperty("modifiedFileTime").ValueKind, "SC/1 source FILETIME stays exact string");
        TestAssert.Equal(claimed.Ticket!.Lease.Source.ModifiedFileTime.ToString(), sourceWire.GetProperty("modifiedFileTime").GetString()!,
            "SC/1 source tick precision survives framed JSON");
        var renewed = await SendAsync(CoreOperations.FileFactRenew, new FileFactLeaseRequest(claimed.Ticket.Lease.LeaseId));
        TestAssert.True(renewed.Body!.Value.GetProperty("renewed").GetBoolean(), "session can renew its own issued lease");
        var pause = ProtocolClient.ReadBody<FileFactHostStatus>(await SendAsync(CoreOperations.FileFactPause, new { }));
        TestAssert.Equal("paused", pause.State, "pause stops dispatch and revokes owned tickets");
        var pausedChanges = await SendAsync(CoreOperations.FileFactConsumeChanges, changeRequest);
        TestAssert.Equal(CoreErrorCodes.NotQueryable, pausedChanges.Error!.Code, "paused grant cannot consume changes");
        var rejected = await SendAsync(CoreOperations.FileFactComplete, new FileFactCompleteRequest(claimed.Ticket.Lease.LeaseId,
            new(FileFactState.Indexed, 800, 600)));
        TestAssert.Equal((int)FileFactBrokerCompletion.LeaseLost, rejected.Body!.Value.GetProperty("completion").GetInt32(),
            "paused session rejects old result without publishing");
        var blocked = await SendAsync(CoreOperations.FileFactClaim, new { });
        TestAssert.Equal(CoreErrorCodes.NotQueryable, blocked.Error!.Code, "paused session cannot hand paths to an extractor");
        await SendAsync(CoreOperations.FileFactConfigure, new FileFactConfigurationRequest(true, policy));
        TestAssert.Equal(1, checkpointCount, "session resume does not repeat schema checkpoint");
        var resumed = ProtocolClient.ReadBody<FileFactClaimResult>(await SendAsync(CoreOperations.FileFactClaim, new { }));
        TestAssert.Equal(FileFactClaimState.Ready, resumed.State, "resume recovers pending work");
        TestAssert.False(resumed.Ticket!.Lease.LeaseId == claimed.Ticket.Lease.LeaseId, "resume issues a fresh ownership token");
        await SendAsync(CoreOperations.FileFactPause, new { });
        await cancelledSession.ConfigureAsync(new(true, policy), CancellationToken.None);
        TestAssert.Equal(1, cancelledCheckpointCount, "retry preserves the successful recovery point instead of repeating it");
        await cancelledSession.PauseAsync(CancellationToken.None);
        var rebuildableSession = new FileFactHostSession(path);
        TestAssert.Equal("active", (await rebuildableSession.ConfigureAsync(new(true, policy), CancellationToken.None)).State,
            "rebuildable store starts without a historical database checkpoint");
        await rebuildableSession.PauseAsync(CancellationToken.None);
        TestAssert.True(await new FileFactDatabase(path).ReadCurrentAsync(identity, FileFactKind.ImageDimensions, 1) is null,
            "revoked session results never enter the fact store");
    }

    private static async Task<long> CountFactTablesAsync(string path)
    {
        await using var connection = new SqliteConnection(new SqliteConnectionStringBuilder {
            DataSource = path, Mode = SqliteOpenMode.ReadOnly, Pooling = false }.ToString());
        await connection.OpenAsync(); using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='file_fact_state';";
        return Convert.ToInt64(await command.ExecuteScalarAsync());
    }
    private sealed class NoReader : ICatalogReaderSessionFactory
    {
        public Task<ICatalogReaderSession> ConnectAsync(CancellationToken token) => throw new InvalidOperationException("Metadata session must not elevate through Reader.");
    }
}
