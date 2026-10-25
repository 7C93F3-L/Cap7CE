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
    string? EntryType = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    string? TextTarget = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    CoreSearchFactFilter? Facts = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    CoreSearchFileConditions? FileConditions = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    string? Continuation = null, bool ExcludeHidden = false,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] uint? RandomSeed = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingDefault)]
    bool IncludeTotalCount = false);

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
    long? Attributes = null)
{
    public string? CreatedFileTimeMilliseconds => CreatedUtcTicks is { } ticks
        ? (ticks / 10000).ToString(System.Globalization.CultureInfo.InvariantCulture) : null;
}

public sealed record SearchPageResponse(
    IReadOnlyList<BasicSearchItem> Items,
    string? NextCursor,
    bool IsComplete,
    long CatalogRevision,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    long? FactRevision = null,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    long? TotalCount = null);

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
    bool NeedsRebuild,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    long? CatalogRevision = null);

public sealed record VolumeListResponse(IReadOnlyList<CoreVolumeStatus> Volumes);

public sealed record VolumeSelectionRequest(IReadOnlyList<string> VolumeIds);

public sealed record VolumeSelectionResponse(IReadOnlyList<string> SelectedVolumeIds);

public sealed record CatalogStatusResponse(
    IReadOnlyList<CoreVolumeStatus> Volumes,
    IReadOnlyList<CoreCatalogTaskStatus> Tasks,
    long CatalogRevision,
    [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)]
    CatalogPreparationProgress? Preparation = null);

public sealed record CatalogResolveScopeRequest(string Path);

public sealed record CatalogResolveScopeResponse(
    bool Resolved,
    string? VolumeId,
    string? RootFileReference,
    string? DisplayName,
    string? State,
    bool Queryable,
    string? DirectoryFileReference = null);

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

public sealed record CatalogAwaitChangesRequest(long AfterSequence, int WaitMilliseconds = 25_000);
public sealed record CatalogChangeScope(string VolumeId,IReadOnlyList<string>? RelativePaths);
public sealed record CatalogChangeNotice(long Sequence, long CatalogRevision, string State, string? Reason, bool Changed,
    [property:System.Text.Json.Serialization.JsonIgnore(Condition=System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<CatalogChangeScope>? Scopes=null);
