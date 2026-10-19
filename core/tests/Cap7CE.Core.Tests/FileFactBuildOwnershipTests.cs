using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Tests;

internal static class FileFactBuildOwnershipTests
{
    public static async Task RunAsync()
    {
        if (!OperatingSystem.IsWindows()) return;
        var reader = new FileFactExecutionTests.ControlledReader();
        await using (var fixture = await FileFactExecutionTests.Fixture.CreateAsync(reader)) {
            var before = await File.ReadAllBytesAsync(fixture.Database);
            var owner = await fixture.Session.AttachBuildOwnerAsync();
            TestAssert.True(before.SequenceEqual(await File.ReadAllBytesAsync(fixture.Database)), "attach neither initializes storage nor changes a policy");
            TestAssert.Equal("inactive", (await owner.ReadStatusAsync(new(FileFactKind.TextData, 1), default)).State, "attach grants no content authority");
            var policy = new FileFactQueuePolicy([fixture.Identity.VolumeId], [new(fixture.Identity.VolumeId)], []);
            await DeniedAsync(() => fixture.Session.ConfigureAsync(new(true, policy), default));
            await owner.ConfigureAsync(new(true, policy), default);
            await owner.DiscoverAsync(new(FileFactKind.TextData, 1, [".txt"]), default);
            var ticket = (await owner.ClaimAsync(default, new([new(FileFactKind.TextData, 1)], fixture.Identity.VolumeId))).Ticket!;
            await DeniedAsync(() => fixture.Session.PauseAsync(default));
            await DeniedAsync(() => fixture.Session.DiscoverAsync(new(FileFactKind.TextData, 1, [".txt"]), default));
            await DeniedAsync(() => fixture.Session.ClaimAsync(default));
            await DeniedAsync(() => fixture.Session.ExecuteAsync(new(ticket.Lease.LeaseId), default));
            await DeniedAsync(() => fixture.Session.RenewAsync(new(ticket.Lease.LeaseId), default));
            await DeniedAsync(() => fixture.Session.CompleteAsync(new(ticket.Lease.LeaseId, new(FileFactState.Failed, ErrorCode: "test")), default));
            await DeniedAsync(() => fixture.Session.ConsumeChangesAsync(new([new(FileFactKind.TextData, 1, [".txt"])]), default));
            TestAssert.Equal(0, reader.Reads, "rejected old requests never reach content reader");
            TestAssert.Equal(FileFactBrokerCompletion.Published, (await owner.ExecuteAsync(new(ticket.Lease.LeaseId), default)).Completion,
                "internal owner completes through the same role fence");
            TestAssert.Equal(1, reader.Reads, "only one owned lease executes");
            TestAssert.True(ReferenceEquals(owner, await fixture.Session.AttachBuildOwnerAsync()), "attach is idempotent after activation");
            await owner.PauseAsync(default);
        }
        await using (var fixture = await FileFactExecutionTests.Fixture.CreateAsync(new FileFactExecutionTests.ControlledReader())) {
            await fixture.ConfigureAsync();
            await DeniedAsync(() => fixture.Session.AttachBuildOwnerAsync());
            TestAssert.Equal("active", (await fixture.Session.ReadStatusAsync(new(FileFactKind.TextData, 1), default)).State,
                "an already active legacy session is not silently stolen");
            await fixture.Session.PauseAsync(default);
        }
        for (var attempt = 0; attempt < 8; attempt++) {
            await using var fixture = await FileFactExecutionTests.Fixture.CreateAsync(new FileFactExecutionTests.ControlledReader());
            var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var attach = Task.Run(async () => { await start.Task; try { await fixture.Session.AttachBuildOwnerAsync(); return true; } catch (CoreProtocolException) { return false; } });
            var legacy = Task.Run(async () => { await start.Task; try { await fixture.ConfigureAsync(); return true; } catch (CoreProtocolException) { return false; } });
            start.SetResult(); var results = await Task.WhenAll(attach, legacy);
            TestAssert.Equal(1, results.Count(value => value), "concurrent attach/legacy activation has exactly one winner");
        }
        await using (var fixture = await FileFactExecutionTests.Fixture.CreateAsync(new FileFactExecutionTests.ControlledReader())) {
            var session = new FileFactHostSession(fixture.Database, contentReader: new FileFactExecutionTests.ControlledReader());
            await using var projection = new ProductCoreRuntime(new CatalogV2Database(fixture.Database), new NoReader(), session);
            await session.AttachBuildOwnerAsync();
            var dispatcher = new CoreRequestDispatcher(projection, new ProductSearchCursorCodec());
            var request = new CoreRequestEnvelope(1, "forged-build-owner", CoreOperations.FileFactConfigure, 5000, CoreProtocolJson.ToElement(new {
                allowMetadataExtraction = true, policy = new FileFactQueuePolicy([fixture.Identity.VolumeId], [new(fixture.Identity.VolumeId)], []), buildOwner = true
            }));
            var response = await dispatcher.DispatchAsync(request, default);
            TestAssert.Equal(CoreErrorCodes.InvalidRequest, response.Error!.Code, "a wire field cannot select the in-process build owner");
        }
        Console.WriteLine("Core build ownership: passive/idempotent attach, mutually exclusive legacy activation, every mutating role fence, internal completion and rejected wire impersonation passed.");
    }
    private static async Task DeniedAsync(Func<Task> action)
    {
        try { await action(); throw new Exception("expected rejected owner"); }
        catch (CoreProtocolException error) { TestAssert.Equal(CoreErrorCodes.NotQueryable, error.Code, "wrong owner fails closed"); }
    }
    private sealed class NoReader : ICatalogReaderSessionFactory
    {
        public Task<ICatalogReaderSession> ConnectAsync(CancellationToken token) => throw new InvalidOperationException("owned binding never starts Reader");
    }
}
