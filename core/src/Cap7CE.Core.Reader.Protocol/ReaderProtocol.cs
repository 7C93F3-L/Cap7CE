namespace Cap7CE.Core.Reader.Protocol;

public static class ReaderProtocol
{
    public const uint Magic = 0x52433743;
    public const ushort LegacyMajorVersion = 1;
    public const ushort CurrentMajorVersion = 2;
    public const ushort CurrentMinorVersion = 0;
    public const ushort HeaderBytes = 32;
    public const int MaximumPayloadBytes = 1024 * 1024;
    public const int MaximumRequestedPages = 64;
    public const int MaximumRecordsPerFrame = 50_000;
    public const int MaximumRecordsPerPage = 4_096;
    public const int MaximumRecordNameBytes = 1_024;
    public const int MaximumExtensionBytes = 64;
    public const int MaximumVolumeDisplayBytes = 32;
    public const int MaximumVolumes = 32;
    public const int HelloNonceBytes = 32;
    public const int MaximumConcurrentRequests = 1;
    public const int DefaultDeadlineMilliseconds = 30_000;
}

public enum ReaderMessageKind : ushort
{
    Request = 1,
    Response = 2
}

public enum ReaderOperation : ushort
{
    Hello = 1,
    Status = 2,
    VolumeInspect = 3,
    MftOpenSnapshot = 4,
    MftReadPage = 5,
    MftCloseSnapshot = 6,
    JournalReadBatch = 7,
    Cancel = 8,
    VolumeEnumerate = 9
}

[Flags]
public enum ReaderFrameFlags : ushort
{
    None = 0,
    MoreData = 1,
    EndOfStream = 2,
    Retryable = 4
}

public enum ReaderStatus : uint
{
    Success = 0,
    InvalidRequest = 1,
    UnsupportedVersion = 2,
    AuthenticationFailed = 3,
    AccessDenied = 4,
    UnsupportedVolume = 5,
    JournalUnavailable = 6,
    JournalDiscontinuous = 7,
    DeadlineExceeded = 8,
    Cancelled = 9,
    Busy = 10,
    InternalFailure = 11
}

public sealed record ReaderSecurityBoundary(
    bool AcceptsArbitraryPaths,
    bool AcceptsDevicePaths,
    bool AcceptsSql,
    bool AcceptsCommands,
    bool ReadsFileContent,
    bool WritesSourceVolumes,
    bool OpensNetworkListeners,
    int MaximumPayloadBytes,
    int MaximumRequestedPages,
    int MaximumConcurrentRequests,
    IReadOnlyList<ReaderOperation> Operations)
{
    public static ReaderSecurityBoundary Describe() => new(
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        ReaderProtocol.MaximumPayloadBytes,
        ReaderProtocol.MaximumRequestedPages,
        ReaderProtocol.MaximumConcurrentRequests,
        Enum.GetValues<ReaderOperation>());
}
