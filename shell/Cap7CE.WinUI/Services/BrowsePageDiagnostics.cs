using System.Diagnostics;
using Cap7CE.Core.Protocol;

namespace Cap7CE.WinUI.Services;

internal enum BrowsePageSource { Catalog, Filesystem }
internal enum BrowsePageStage { Request, Append, Notify }
internal readonly record struct BrowsePageState(int LoadedItems, bool Current, bool CoreConnected,
    bool? CoreChanged = null, bool? LiveContinuation = null, bool? VisualWorkerActive = null);

// Failure-only evidence. Never serialize provider messages, paths or opaque cursors.
internal sealed class BrowsePageDiagnostics
{
    private readonly BrowsePageSource source;
    private readonly int navigation;
    private readonly TimeProvider clock;
    private readonly Action<object> write;
    private long lastSuccess;
    public BrowsePageDiagnostics(BrowsePageSource source, int navigation, TimeProvider? clock = null, Action<object>? write = null)
    {
        this.source = source; this.navigation = navigation; this.clock = clock ?? TimeProvider.System;
        this.write = write ?? (detail => SessionDiagnostics.Record("browse.page.error", detail));
        lastSuccess = this.clock.GetTimestamp();
    }
    public long Start() => clock.GetTimestamp();
    public void Succeeded() => lastSuccess = clock.GetTimestamp();
    public void Failed(Exception error, long started, BrowsePageStage stage, Func<BrowsePageState> state)
    {
        if (error is OperationCanceledException) return;
        try
        {
            BrowsePageState? observed = null;
            try { observed = state(); } catch { /* A retired worker may no longer be observable. */ }
            write(new
            {
                navigation, source = source == BrowsePageSource.Catalog ? "catalog" : "filesystem",
                stage = stage switch { BrowsePageStage.Append => "append", BrowsePageStage.Notify => "notify", _ => "request" },
                state = observed, elapsedMs = Math.Round(clock.GetElapsedTime(started).TotalMilliseconds, 2),
                sinceLastSuccessfulPageMs = Math.Round(clock.GetElapsedTime(lastSuccess).TotalMilliseconds, 2),
                error = Describe(error, 0)
            });
        }
        catch { /* Diagnostics must not change continuation failure handling. */ }
    }
    private static object Describe(Exception error, int depth) => new
    {
        type = error.GetType().FullName, hresult = $"0x{error.HResult:X8}",
        code = SafeCode(error.Message), providerCode = SafeCode(error.Data["CoreMessage"] as string),
        nativeCode = (error as System.ComponentModel.Win32Exception)?.NativeErrorCode,
        frames = new StackTrace(error, false).GetFrames().Take(8).Select(frame => new
        {
            method = frame.GetMethod()?.DeclaringType?.FullName + "." + frame.GetMethod()?.Name,
            ilOffset = frame.GetILOffset()
        }).ToArray(),
        inner = depth < 2 && error.InnerException is { } inner ? Describe(inner, depth + 1) : null
    };
    private static string? SafeCode(string? value) => value is not null && Codes.Contains(value) ? value : null;
    private static readonly HashSet<string> Codes = new(StringComparer.Ordinal)
    {
        CoreErrorCodes.InvalidFrame, CoreErrorCodes.MessageTooLarge, CoreErrorCodes.InvalidRequest,
        CoreErrorCodes.DuplicateRequest, CoreErrorCodes.HandshakeRequired, CoreErrorCodes.AuthenticationFailed,
        CoreErrorCodes.UnsupportedProtocol, CoreErrorCodes.UnknownOperation, CoreErrorCodes.DeadlineExceeded,
        CoreErrorCodes.Cancelled, CoreErrorCodes.InvalidCursor, CoreErrorCodes.Internal,
        CoreErrorCodes.NotQueryable, CoreErrorCodes.TaskNotFound,
        "core-cache-operation-failed", "directory-browse-invalid-request", "directory-browse-cancelled",
        "directory-browse-capacity-exceeded", "ENOENT", "ENOTDIR", "EACCES", "EPERM", "EINVAL", "EIO", "EBUSY", "ECANCELED", "ETIMEDOUT",
        "ui.error.coreTimeout", "ui.error.coreDisconnected", "ui.error.rpcEnded", "ui.error.rpcQueue",
        "ui.error.rpcRequest", "ui.error.rpcResponse", "ui.error.coreEmpty", "ui.error.nodeHost",
        "ui.error.nodeChecksum", "ui.error.browsePath", "ui.error.directoryPath"
    };
}
