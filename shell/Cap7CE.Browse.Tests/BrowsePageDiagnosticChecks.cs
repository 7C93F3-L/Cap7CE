using System.ComponentModel;
using System.Text.Json;
using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Controllers;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;

internal static class BrowsePageDiagnosticChecks
{
    private static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    public static async Task RunAsync()
    {
        var clock = new Clock(); var records = new List<string>();
        var diagnostics = new BrowsePageDiagnostics(BrowsePageSource.Catalog, 42, clock,
            detail => records.Add(JsonSerializer.Serialize(detail)));
        var secret = @"Q:\PAGE_DIAGNOSTIC_PRIVATE\query-and-cursor-secret";
        Exception failure;
        try { throw new IOException(CoreErrorCodes.InvalidCursor, new FileNotFoundException(secret, secret)); }
        catch (Exception error) { failure = error; }
        failure.Data["CoreMessage"] = "directory-browse-invalid-request";
        failure.Data["cursor"] = secret;
        clock.Advance(300_000); var started = diagnostics.Start(); clock.Advance(120);
        Check(records.Count == 0, "successful activity must not write a per-page trace");
        diagnostics.Failed(failure, started, BrowsePageStage.Request, () => new(100, true, false, true, true));
        using (var json = JsonDocument.Parse(records.Single()))
        {
            var value = json.RootElement;
            Check(value.GetProperty("source").GetString() == "catalog" && value.GetProperty("navigation").GetInt32() == 42,
                "failure identifies the route and navigation without its address");
            Check(value.GetProperty("stage").GetString() == "request" && value.GetProperty("elapsedMs").GetDouble() == 120
                && value.GetProperty("sinceLastSuccessfulPageMs").GetDouble() == 300_120, "monotonic timings separate waiting and cursor inactivity");
            Check(value.GetProperty("error").GetProperty("code").GetString() == "invalid-cursor"
                && value.GetProperty("error").GetProperty("providerCode").GetString() == "directory-browse-invalid-request",
                "only known protocol/provider codes are retained");
            Check(value.GetProperty("error").GetProperty("frames").GetArrayLength() > 0, "method-only stack remains useful");
            Check(value.GetProperty("state").GetProperty("CoreChanged").GetBoolean(), "a replaced connection is distinguishable");
        }
        Check(!records[0].Contains(secret) && !records[0].Contains("PAGE_DIAGNOSTIC_PRIVATE")
            && !records[0].Contains(AppContext.BaseDirectory), "exception messages, filenames, provider data and cursors are not logged");
        diagnostics.Succeeded(); clock.Advance(50); started = diagnostics.Start(); clock.Advance(5);
        var unknown = new IOException(secret); unknown.Data["CoreMessage"] = secret;
        diagnostics.Failed(unknown, started, BrowsePageStage.Append, () => new(101, false, true));
        using (var json = JsonDocument.Parse(records[1]))
        {
            var value = json.RootElement;
            Check(value.GetProperty("sinceLastSuccessfulPageMs").GetDouble() == 55, "a successful page renews the observed interval");
            Check(value.GetProperty("error").GetProperty("code").ValueKind == JsonValueKind.Null
                && value.GetProperty("error").GetProperty("providerCode").ValueKind == JsonValueKind.Null,
                "unknown messages cannot masquerade as safe error codes");
            Check(!value.GetProperty("state").GetProperty("Current").GetBoolean(), "late errors are marked stale");
        }
        var filesystem = new BrowsePageDiagnostics(BrowsePageSource.Filesystem, 43, clock,
            detail => records.Add(JsonSerializer.Serialize(detail)));
        filesystem.Failed(new Win32Exception(5, secret), filesystem.Start(), BrowsePageStage.Notify,
            () => new(200, true, true, VisualWorkerActive: false));
        using (var json = JsonDocument.Parse(records[2]))
            Check(json.RootElement.GetProperty("error").GetProperty("nativeCode").GetInt32() == 5
                && json.RootElement.GetProperty("source").GetString() == "filesystem"
                && json.RootElement.GetProperty("stage").GetString() == "notify", "native code and filesystem worker state are captured");
        diagnostics.Failed(new OperationCanceledException(secret), started, BrowsePageStage.Request, () => new(100, false, false));
        Check(records.Count == 3 && records.All(record => !record.Contains(secret)), "cancel remains silent and all routes redact details");
        new BrowsePageDiagnostics(BrowsePageSource.Catalog, 1, clock, _ => throw new IOException("sink unavailable"))
            .Failed(failure, 0, BrowsePageStage.Request, () => new(1, true, true));
        diagnostics.Failed(failure, started, BrowsePageStage.Request, () => throw new ObjectDisposedException("retired worker"));
        using (var json = JsonDocument.Parse(records[3]))
            Check(json.RootElement.GetProperty("state").ValueKind == JsonValueKind.Null,
                "failed state observation cannot block either the original error record or UI handling");
        await FailureBehaviorAsync();
        Console.WriteLine("Paging diagnostics passed: failure-only, redacted codes/stacks, timing, stale connection, both routes, cancellation and unchanged no-retry behavior.");
    }
    private static async Task FailureBehaviorAsync()
    {
        var services = new ShellServices { Core = new() };
        using (var browse = new BrowseSession(services))
        {
            Check(await browse.OpenLocationAsync(@"E:\", true), "Catalog fixture opens");
            services.Core.NextPage = _ => Task.FromException<SearchPageResponse>(new IOException("invalid-cursor"));
            var items = browse.Items;
            Check(await items.LoadPage!() == 0 && items.Count == 1 && !items.HasMoreItems && browse.Error is not null,
                "failure preserves existing items, stops paging and retains the current notice");
            Check(services.Core.Requests.Count(r => r.Operation == CoreOperations.SearchNextPage) == 1,
                "diagnostics must not replay the failed page");
        }
        var direct = new ShellServices { Core = new() };
        direct.Visuals.Items = [new(new("file", "file.txt", "file.txt", ".txt", false, "v"), @"E:\file.txt")];
        direct.Visuals.HasMore = true; direct.Visuals.NextFailure = new IOException("core-cache-operation-failed");
        using (var browse = new BrowseSession(direct))
        {
            Check(await browse.NavigateAsync(@"E:\"), "filesystem fixture opens");
            Check(await browse.Items.LoadPage!() == 0 && browse.Items.Count == 1 && !browse.Items.HasMoreItems
                && browse.Error is not null && direct.Core.Requests.Count == 0, "filesystem failure still uses its own owner and notice");
        }
        var stale = new ShellServices { Core = new() };
        using (var browse = new BrowseSession(stale))
        {
            await browse.OpenLocationAsync(@"E:\", true);
            var late = new TaskCompletionSource<SearchPageResponse>(TaskCreationOptions.RunContinuationsAsynchronously);
            stale.Core.NextPage = _ => late.Task;
            var pending = browse.Items.LoadPage!();
            await browse.NavigateAsync(@"E:\nested"); var current = browse.Items;
            late.SetException(new IOException("invalid-cursor")); await pending;
            Check(ReferenceEquals(browse.Items, current) && current.HasMoreItems && browse.Error is null,
                "a late failure cannot damage the new navigation");
        }
    }
    private sealed class Clock : TimeProvider
    {
        private long ticks;
        public override long TimestampFrequency => TimeSpan.TicksPerSecond;
        public override long GetTimestamp() => ticks;
        public void Advance(int milliseconds) => ticks += TimeSpan.FromMilliseconds(milliseconds).Ticks;
    }
}
