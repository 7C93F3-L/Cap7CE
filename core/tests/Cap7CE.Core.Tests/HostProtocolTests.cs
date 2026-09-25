using System.Security.Cryptography;
using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Tests;

internal static class HostProtocolTests
{
    public static async Task RunAsync()
    {
        FreezesLifecycleClientActivation();
        FreezesP31ProbeActivation();
        await RejectsMissingHandshakeAsync();
        await RejectsWrongSecretAsync();
        await RejectsWrongClientIdentityAsync();
        await RunsAuthenticatedSessionAsync();
    }

    private static void FreezesLifecycleClientActivation()
    {
        TestAssert.True(
            CoreHostOptions.TryParse(["--reader-lifecycle-client"], out var lifecycle),
            "reader lifecycle client option");
        TestAssert.Equal(CoreHostMode.ReaderLifecycleClient, lifecycle.Mode,
            "reader lifecycle client mode");
        TestAssert.False(
            CoreHostOptions.TryParse(["--reader-lifecycle-client", "unexpected"], out _),
            "reader lifecycle client must reject free arguments");
    }

    private static void FreezesP31ProbeActivation()
    {
        TestAssert.True(
            CoreHostOptions.TryParse(["--core-p31-initial-probe"], out var initial),
            "P3.1 initial probe option");
        TestAssert.Equal(CoreHostMode.CoreP31InitialProbe, initial.Mode,
            "P3.1 initial probe mode");
        TestAssert.False(
            CoreHostOptions.TryParse(["--core-p31-initial-probe", "unexpected"], out _),
            "P3.1 initial probe must reject free arguments");
    }

    private static async Task RejectsMissingHandshakeAsync()
    {
        await using var host = await HostProcessFixture.StartAsync();
        var response = await host.Client.RequestAsync("no-hello", CoreOperations.SearchStart,
            Search("fixture", 20));
        AssertError(response, CoreErrorCodes.HandshakeRequired);
    }

    private static async Task RejectsWrongSecretAsync()
    {
        await using var host = await HostProcessFixture.StartAsync();
        var wrongSecret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var response = await HelloAsync(host.Client, wrongSecret);
        AssertError(response, CoreErrorCodes.AuthenticationFailed);
    }

    private static async Task RejectsWrongClientIdentityAsync()
    {
        await using var host = await HostProcessFixture.StartAsync();
        var response = await HelloAsync(host.Client, host.EncodedSecret, Environment.ProcessId + 1);
        AssertError(response, CoreErrorCodes.AuthenticationFailed);
    }

    private static async Task RunsAuthenticatedSessionAsync()
    {
        await using var host = await HostProcessFixture.StartAsync();
        var hello = await HelloAsync(host.Client, host.EncodedSecret);
        var helloBody = ProtocolClient.ReadBody<SessionHelloResponse>(hello);
        TestAssert.Equal(CoreProtocol.CurrentVersion, helloBody.SelectedProtocolVersion, "negotiated protocol");
        TestAssert.Equal("1.0.4", helloBody.ServerProductVersion, "server product version");
        TestAssert.Equal(host.ProcessId, helloBody.ServerProcessId, "server process identity");
        TestAssert.Equal(CoreProtocol.MaximumFrameBytes, helloBody.MaximumFrameBytes, "frame limit");
        TestAssert.Equal(CoreProtocol.MaximumPageSize, helloBody.MaximumPageSize, "page limit");
        TestAssert.True(helloBody.SyntheticFixture, "synthetic marker");
        TestAssert.True(helloBody.Capabilities.SequenceEqual(CoreOperations.P11Capabilities), "capabilities");

        await VerifyStructuredFailuresAsync(host.Client);
        await VerifyTamperResistanceAsync(host.Client);
        await VerifyDeadlineAsync(host.Client);
        await VerifyCancellationAsync(host.Client);
        await VerifyCompletePagingAsync(host.Client);
    }

    private static async Task VerifyStructuredFailuresAsync(ProtocolClient client)
    {
        var unknown = await client.RequestAsync("unknown-1", "unknown.operation", new { });
        AssertError(unknown, CoreErrorCodes.UnknownOperation);

        var duplicate = await client.RequestAsync("unknown-1", "unknown.operation", new { });
        AssertError(duplicate, CoreErrorCodes.DuplicateRequest);

        var mismatch = await client.RequestAsync(
            "version-1", CoreOperations.SearchStart, Search("fixture", 20),
            protocolVersion: CoreProtocol.CurrentVersion + 1);
        AssertError(mismatch, CoreErrorCodes.UnsupportedProtocol);

        var invalidPage = await client.RequestAsync(
            "invalid-page-1", CoreOperations.SearchStart,
            Search("fixture", CoreProtocol.MaximumPageSize + 1));
        AssertError(invalidPage, CoreErrorCodes.InvalidRequest);
    }

    private static async Task VerifyTamperResistanceAsync(ProtocolClient client)
    {
        var response = await client.RequestAsync(
            "tamper-start", CoreOperations.SearchStart, Search("fixture", 1));
        var page = ProtocolClient.ReadBody<SearchPageResponse>(response);
        TestAssert.True(page.NextCursor is not null, "tamper test cursor");
        var cursor = page.NextCursor!;
        var signatureStart = cursor.IndexOf('.', StringComparison.Ordinal) + 1;
        TestAssert.True(signatureStart > 0 && signatureStart < cursor.Length, "tamper test signature");
        var replacement = cursor[signatureStart] == 'A' ? 'B' : 'A';
        var tampered = cursor[..signatureStart] + replacement + cursor[(signatureStart + 1)..];
        var tamperResponse = await client.RequestAsync(
            "tamper-next", CoreOperations.SearchNextPage, new SearchNextPageRequest(tampered));
        AssertError(tamperResponse, CoreErrorCodes.InvalidCursor);
    }

    private static async Task VerifyDeadlineAsync(ProtocolClient client)
    {
        var response = await client.RequestAsync(
            "deadline-1", CoreOperations.SearchStart, Search("slow-fixture", 20), deadlineMs: 1);
        AssertError(response, CoreErrorCodes.DeadlineExceeded);
        TestAssert.True(response.Error?.Retryable == true, "deadline should be retryable");
    }

    private static async Task VerifyCancellationAsync(ProtocolClient client)
    {
        await client.SendAsync("cancel-target", CoreOperations.SearchStart, Search("slow-fixture", 20));
        await Task.Delay(25);
        await client.SendAsync("cancel-command", CoreOperations.SearchCancel, new SearchCancelRequest("cancel-target"));

        var first = await client.ReadAsync();
        var second = await client.ReadAsync();
        var responses = new[] { first, second }.ToDictionary(response => response.RequestId, StringComparer.Ordinal);
        var cancel = ProtocolClient.ReadBody<SearchCancelResponse>(responses["cancel-command"]);
        TestAssert.True(cancel.Accepted, "active request cancellation should be accepted");
        AssertError(responses["cancel-target"], CoreErrorCodes.Cancelled);
    }

    private static async Task VerifyCompletePagingAsync(ProtocolClient client)
    {
        var response = await client.RequestAsync(
            "page-start", CoreOperations.SearchStart,
            Search("fixture", CoreProtocol.MaximumPageSize), deadlineMs: 10_000);
        var page = ProtocolClient.ReadBody<SearchPageResponse>(response);
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var requestNumber = 0;

        while (true)
        {
            TestAssert.True(page.Items.Count <= CoreProtocol.MaximumPageSize, "page size limit");
            foreach (var item in page.Items)
            {
                TestAssert.True(ids.Add(item.Id), "paged results must not repeat items");
                TestAssert.True(item.RelativePath.StartsWith("synthetic/", StringComparison.Ordinal), "synthetic relative path");
            }
            if (page.IsComplete)
            {
                TestAssert.True(page.NextCursor is null, "complete page must not expose cursor");
                break;
            }

            TestAssert.True(page.NextCursor is not null, "incomplete page needs cursor");
            response = await client.RequestAsync(
                $"page-next-{requestNumber++}",
                CoreOperations.SearchNextPage,
                new SearchNextPageRequest(page.NextCursor!));
            page = ProtocolClient.ReadBody<SearchPageResponse>(response);
        }

        TestAssert.Equal(100_000, ids.Count, "all cross-process synthetic results must be paged exactly once");
    }

    private static Task<CoreResponseEnvelope> HelloAsync(
        ProtocolClient client,
        string secret,
        int? clientProcessId = null) =>
        client.RequestAsync("hello", CoreOperations.SessionHello,
            new SessionHelloRequest(
                secret,
                [CoreProtocol.CurrentVersion],
                "Cap7CE.Core.Tests",
                "1.0.4",
                clientProcessId ?? Environment.ProcessId));

    private static SearchStartRequest Search(string query, int pageSize) => new(
        query,
        pageSize,
        CoreSearchSorts.NameAscending,
        [SyntheticMetadataSearchSource.VolumeId]);

    private static void AssertError(CoreResponseEnvelope response, string code)
    {
        TestAssert.Equal(CoreResponseStatuses.Error, response.Status, $"request {response.RequestId} error status");
        TestAssert.Equal(code, response.Error?.Code, $"request {response.RequestId} error code");
        TestAssert.True(response.Body is null, "error response must not include a body");
    }
}
