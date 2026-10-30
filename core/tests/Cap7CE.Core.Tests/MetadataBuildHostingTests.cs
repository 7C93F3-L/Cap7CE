using System.Reflection;
using System.Text.Json;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host;
using Cap7CE.Core.Host.MetadataBuildHosting;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Tests;

internal static class MetadataBuildHostingTests
{
    public static async Task RunAsync()
    {
        if (!OperatingSystem.IsWindows()) return;
        await using var fixture = await FileFactExecutionTests.Fixture.CreateAsync(new FileFactExecutionTests.ControlledReader());
        var reader = new FileFactExecutionTests.ControlledReader(); var session = new FileFactHostSession(fixture.Database, contentReader: reader);
        await using var runtime = new ProductCoreRuntime(new CatalogV2Database(fixture.Database), new NoReader(), session);
        var config = Path.Combine(Path.GetDirectoryName(fixture.Source)!, "hosted-config");
        var service = new MetadataBuildService(session, runtime, FileFactExecutionTests.Resources, config); runtime.ConfigureMetadataBuild(service);
        var dispatcher = new CoreRequestDispatcher(runtime, new ProductSearchCursorCodec()); var sequence = 0;
        async Task<JsonElement> Send(string operation, object? body = null)
        {
            var response = await dispatcher.DispatchAsync(new(1, "build-host-" + ++sequence, operation, 10000, CoreProtocolJson.ToElement(body ?? new { })), default);
            TestAssert.Equal(CoreResponseStatuses.Success, response.Status, "domain reply stays in the authenticated response envelope"); return response.Body!.Value;
        }
        TestAssert.True(MetadataBuildOperations.All.All(dispatcher.Capabilities.Contains), "only assembled build capabilities advertised");
        TestAssert.Equal("metadata-build-not-attached", (await Send(MetadataBuildOperations.Status)).GetProperty("errorCode").GetString(), "new API cannot implicitly take legacy ownership");
        TestAssert.True((await Send(MetadataBuildOperations.Attach)).GetProperty("result").GetProperty("attached").GetBoolean(), "explicit attach acknowledgement");
        TestAssert.False(Directory.Exists(config), "attach does not write configuration"); TestAssert.Equal(0, reader.Reads, "attach never reads content");
        var policy = new FileFactQueuePolicy([fixture.Identity.VolumeId], [new(fixture.Identity.VolumeId)], []);
        await Send(MetadataBuildOperations.SavePolicy, new { policy }); await Send(MetadataBuildOperations.Restore);
        TestAssert.Equal(0, reader.Reads, "configured restore is passive over protocol");
        TestAssert.Equal("metadata-build-confirmation-required", (await Send(MetadataBuildOperations.Start, new { allowMetadataExtraction = false, policy })).GetProperty("errorCode").GetString(), "wire false consent rejected");
        TestAssert.Equal("metadata-build-invalid-request", (await Send(MetadataBuildOperations.SavePolicy, new { policy, buildOwner = true })).GetProperty("errorCode").GetString(), "unexpected parameters rejected");
        await Send(MetadataBuildOperations.StartDirectory, new { allowMetadataExtraction = true, path = Path.GetDirectoryName(fixture.Source)! });
        for (var step = 0; step < 1000; step++) {
            var status = (await Send(MetadataBuildOperations.Status)).GetProperty("result");
            if (reader.Reads == 1 && !status.TryGetProperty("directoryTask", out _)) break;
            if (step == 999) throw new InvalidOperationException("hosted directory never completed"); await Task.Delay(3);
        }
        TestAssert.Equal(1, reader.Reads, "host dispatch executes only owned generated source");
        var slots = (SemaphoreSlim)typeof(CoreRequestDispatcher).GetField("executionSlots", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(dispatcher)!;
        await slots.WaitAsync(); await slots.WaitAsync();
        try {
            var paused = await Send(MetadataBuildOperations.Pause).WaitAsync(TimeSpan.FromSeconds(3));
            TestAssert.True(paused.GetProperty("errorCode").ValueKind == JsonValueKind.Null, "control can stop while both query slots are occupied");
            var canceled=await Send(MetadataBuildOperations.Cancel).WaitAsync(TimeSpan.FromSeconds(3));
            TestAssert.Equal("idle",canceled.GetProperty("result").GetProperty("progress").GetProperty("phase").GetString(),"cancel bypasses query slots and returns configuration to idle");
        }
        finally { slots.Release(2); }
        await Send(MetadataBuildOperations.Shutdown);
        TestAssert.Equal("metadata-build-start-cancelled", (await Send(MetadataBuildOperations.Attach)).GetProperty("errorCode").GetString(), "shutdown forbids late reattachment");
        await using var coldFixture = await FileFactExecutionTests.Fixture.CreateAsync(new FileFactExecutionTests.ControlledReader());
        var coldRoot = Path.Combine(Path.GetDirectoryName(coldFixture.Source)!, "absent-profile");
        var cold = new MetadataBuildService(coldFixture.Session, runtime, FileFactExecutionTests.Resources, coldRoot);
        await cold.ShutdownAsync(); TestAssert.False(Directory.Exists(coldRoot), "cold cleanup never creates an owner or profile");
        Console.WriteLine("Core metadata hosting: explicit passive attach, capabilities, real JSON/lease dispatch, domain errors, independent bounded control slot and cold shutdown passed.");
    }
    private sealed class NoReader : ICatalogReaderSessionFactory
    {
        public Task<ICatalogReaderSession> ConnectAsync(CancellationToken token) => throw new InvalidOperationException("hosting tests never connect Reader");
    }
}
