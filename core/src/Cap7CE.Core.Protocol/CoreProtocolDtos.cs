namespace Cap7CE.Core.Protocol;

public sealed record SessionHelloRequest(
    string SessionSecret,
    IReadOnlyList<int> SupportedProtocolVersions,
    string ClientName,
    string ClientProductVersion,
    int ClientProcessId);

public sealed record SessionHelloResponse(
    int SelectedProtocolVersion,
    string ServerName,
    string ServerProductVersion,
    int ServerProcessId,
    int MaximumFrameBytes,
    int MaximumPageSize,
    IReadOnlyList<string> Capabilities,
    bool SyntheticFixture);

public sealed record SearchStartRequest(
    string Query,
    int PageSize,
    string Sort,
    IReadOnlyList<string> VolumeIds,
    CoreSearchScopeRequest? Scope = null,
    string? Extension = null,
    string? EntryType = null);

public sealed record CoreSearchScopeRequest(
    string Kind,
    string? VolumeId = null,
    string? RootFileReference = null,
    string? SavedScopeId = null);

public sealed record SearchNextPageRequest(string Cursor);

public sealed record SearchCancelRequest(string TargetRequestId);

public sealed record SearchCancelResponse(bool Accepted);

public sealed record BasicSearchItem(
    string Id,
    string Name,
    string RelativePath,
    string Extension,
    bool IsDirectory,
    string? VolumeId = null,
    string? FileReference = null,
    long? SizeBytes = null,
    long? CreatedUtcTicks = null,
    long? ModifiedUtcTicks = null,
    long? Attributes = null);

public sealed record SearchPageResponse(
    IReadOnlyList<BasicSearchItem> Items,
    string? NextCursor,
    bool IsComplete,
    long CatalogRevision);

public sealed record CapabilityStatusResponse(
    string State,
    int CatalogSchemaVersion,
    string PathStrategy,
    bool ElectronConnected,
    bool ReadsFileContent,
    bool WritesSourceVolumes,
    bool UsesNetwork);

public sealed record CoreVolumeStatus(
    string VolumeId,
    string DisplayName,
    string FileSystem,
    bool Selected,
    string State,
    long Processed,
    long? Total,
    bool Queryable,
    bool NeedsRebuild);

public sealed record VolumeListResponse(IReadOnlyList<CoreVolumeStatus> Volumes);

public sealed record VolumeSelectionRequest(IReadOnlyList<string> VolumeIds);

public sealed record VolumeSelectionResponse(IReadOnlyList<string> SelectedVolumeIds);

public sealed record CatalogStatusResponse(
    IReadOnlyList<CoreVolumeStatus> Volumes,
    IReadOnlyList<CoreCatalogTaskStatus> Tasks,
    long CatalogRevision);

public sealed record CatalogResolveScopeRequest(string Path);

public sealed record CatalogResolveScopeResponse(
    bool Resolved,
    string? VolumeId,
    string? RootFileReference,
    string? DisplayName,
    string? State,
    bool Queryable);

public sealed record CoreCatalogTaskStatus(
    string TaskId,
    string Kind,
    string State,
    string? ErrorCode);

public sealed record CatalogBuildRequest(IReadOnlyList<string> VolumeIds);

public sealed record CatalogBuildResponse(string TaskId, bool Accepted);

public sealed record CatalogCancelRequest(string TaskId);

public sealed record CatalogCancelResponse(bool Accepted);

public sealed record CoreShutdownResponse(bool Accepted);
