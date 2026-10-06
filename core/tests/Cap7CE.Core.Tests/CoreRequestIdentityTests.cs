using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Tests;

internal static class CoreRequestIdentityTests
{
    public static async Task RunAsync()
    {
        var ordered = new CoreRequestIdentityTracker();
        for (var index = 1; index <= 1_000_000; index++)
            TestAssert.Equal(CoreRequestIdentityResult.Accepted, ordered.Register($"shell-{index}-0123abcd"), "ordered request accepted");
        TestAssert.Equal(0, ordered.RetainedIdentityCount, "million completed request identities are not retained");
        foreach (var id in new[] { "shell-1-0123abcd", "shell-999999-ffffffff", "shell-1000000-76543210" })
            TestAssert.Equal(CoreRequestIdentityResult.Duplicate, ordered.Register(id), "old ordinal cannot replay even with a different nonce");
        foreach (var id in new[] { "other", "shell-0-0123abcd", "shell-01000001-0123abcd", "shell-1000001-abcdefgh",
            "shell-1000001-0123abc", "shell-9007199254740992-0123abcd", "shell-+1000001-0123abcd" })
            TestAssert.Equal(CoreRequestIdentityResult.InvalidSequence, ordered.Register(id), "ordered session cannot switch identity mode");
        TestAssert.Equal(CoreRequestIdentityResult.Accepted, ordered.Register("shell-1000002-0123abcd"), "an unsent ordinal gap is safe");
        var opaque = new CoreRequestIdentityTracker();
        for (var index = 0; index < CoreRequestIdentityTracker.MaximumOpaqueIdentities; index++)
            TestAssert.Equal(CoreRequestIdentityResult.Accepted, opaque.Register($"request-{index}"), "opaque identity bounded admission");
        TestAssert.Equal(CoreRequestIdentityResult.CapacityExceeded, opaque.Register("new-request"), "bounded identity capacity stops session");
        TestAssert.Equal(CoreRequestIdentityResult.Duplicate, opaque.Register("request-0"), "capacity does not evict and permit old replays");
        TestAssert.Equal(CoreRequestIdentityTracker.MaximumOpaqueIdentities, opaque.RetainedIdentityCount, "opaque replay memory remains bounded");
        TestAssert.Equal(CoreRequestIdentityResult.Accepted, new CoreRequestIdentityTracker().Register("shell-1-0123abcd"), "new authenticated session has its own sequence");
        await using var host = await HostProcessFixture.StartAsync();
        var hello = await host.Client.RequestAsync("shell-1-0123abcd", CoreOperations.SessionHello,
            new SessionHelloRequest(host.EncodedSecret, [CoreProtocol.CurrentVersion], "identity-test", "1.0.4", Environment.ProcessId));
        TestAssert.Equal(CoreResponseStatuses.Success, hello.Status, "ordered authenticated handshake accepted");
        var accepted = await host.Client.RequestAsync("shell-2-0123abcd", "unknown.operation", new { });
        TestAssert.Equal(CoreErrorCodes.UnknownOperation, accepted.Error!.Code, "ordered request reaches dispatcher");
        var replay = await host.Client.RequestAsync("shell-2-ffffffff", "unknown.operation", new { });
        TestAssert.Equal(CoreErrorCodes.DuplicateRequest, replay.Error!.Code, "framed ordinal replay rejected before dispatch");
        var modeSwitch = await host.Client.RequestAsync("opaque-control", "unknown.operation", new { });
        TestAssert.Equal(CoreErrorCodes.InvalidRequest, modeSwitch.Error!.Code, "framed ordered session cannot change identity mode");
        var next = await host.Client.RequestAsync("shell-3-0123abcd", "unknown.operation", new { });
        TestAssert.Equal(CoreErrorCodes.UnknownOperation, next.Error!.Code, "next valid ordinal remains usable after rejected replay");
    }
}
