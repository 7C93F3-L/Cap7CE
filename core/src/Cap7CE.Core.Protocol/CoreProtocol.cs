namespace Cap7CE.Core.Protocol;

public static class CoreProtocol
{
    public const int CurrentVersion = 1;
    public const int MaximumFrameBytes = 1024 * 1024;
    public const int DefaultPageSize = 100;
    public const int MaximumPageSize = 200;
    public const int MaximumDeadlineMilliseconds = 120_000;
    public const int MaximumRequestIdLength = 128;
    public const int MaximumQueryLength = 512;
    public const int MaximumVolumeIds = 32;
}

public static class CoreSearchSorts
{
    public const string NameAscending = "name-ascending";
}

public static class CoreOperations
{
    public const string SessionHello = "session.hello";
    public const string CapabilityStatus = "capability.status";
    public const string VolumeList = "volume.list";
    public const string VolumeSelection = "volume.selection";
    public const string CatalogStatus = "catalog.status";
    public const string CatalogAwaitChanges = "catalog.awaitChanges";
    public const string CatalogBuild = "catalog.build";
    public const string CatalogRebuild = "catalog.rebuild";
    public const string CatalogCancel = "catalog.cancel";
    public const string CatalogResolveScope = "catalog.resolveScope";
    public const string SearchStart = "search.start";
    public const string SearchNextPage = "search.nextPage";
    public const string SearchCancel = "search.cancel";
    public const string CoreShutdown = "core.shutdown";
    public const string FileFactConfigure = "metadata.configure";
    public const string FileFactDiscover = "metadata.discover";
    public const string FileFactConsumeChanges = "metadata.consumeChanges";
    public const string FileFactClaim = "metadata.claim";
    public const string FileFactPause = "metadata.pause";
    public const string FileFactRenew = "metadata.renew";
    public const string FileFactComplete = "metadata.complete";
    public const string FileFactStatus = "metadata.status";

    public static readonly IReadOnlyList<string> FileFactCapabilities =
        [FileFactConfigure, FileFactDiscover, FileFactConsumeChanges, FileFactClaim, FileFactPause, FileFactRenew, FileFactComplete, FileFactStatus];

    public static readonly IReadOnlyList<string> P11Capabilities =
    [
        SessionHello,
        SearchStart,
        SearchNextPage,
        SearchCancel
    ];

    public static readonly IReadOnlyList<string> P31Capabilities =
    [
        CapabilityStatus,
        VolumeList,
        VolumeSelection,
        CatalogStatus,
        CatalogBuild,
        CatalogRebuild,
        CatalogCancel,
        CatalogResolveScope,
        SearchStart,
        SearchNextPage,
        SearchCancel,
        CoreShutdown
    ];
}

public static class CoreResponseStatuses
{
    public const string Success = "success";
    public const string Error = "error";
}

public static class CoreErrorCodes
{
    public const string InvalidFrame = "invalid-frame";
    public const string MessageTooLarge = "message-too-large";
    public const string InvalidRequest = "invalid-request";
    public const string DuplicateRequest = "duplicate-request";
    public const string HandshakeRequired = "handshake-required";
    public const string AuthenticationFailed = "authentication-failed";
    public const string UnsupportedProtocol = "unsupported-protocol";
    public const string UnknownOperation = "unknown-operation";
    public const string DeadlineExceeded = "deadline-exceeded";
    public const string Cancelled = "cancelled";
    public const string InvalidCursor = "invalid-cursor";
    public const string Internal = "internal";
    public const string NotQueryable = "not-queryable";
    public const string TaskNotFound = "task-not-found";
}
