namespace Cap7CE.Core.Catalog;

public enum CatalogVolumeState
{
    Disabled,
    Discovering,
    Building,
    Ready,
    CatchingUp,
    Offline,
    Degraded,
    NeedsRebuild
}

public sealed record CatalogStateSnapshot(
    int SchemaVersion,
    long CatalogRevision,
    string? CommittedSnapshotId,
    bool Queryable,
    bool NeedsRebuild);

public sealed record CatalogVolumeSnapshot(
    string VolumeId,
    string FileSystem,
    string? JournalId,
    string? Checkpoint,
    CatalogVolumeState State,
    long CatalogRevision);

public sealed record CatalogNodeRecord(
    string VolumeId,
    long FileReference,
    long? ParentReference,
    string Name,
    string Extension,
    bool IsDirectory,
    long Attributes,
    bool Exists,
    long? SizeBytes,
    long? ModifiedUtcTicks);

public sealed record CatalogWriteBatch(
    string VolumeId,
    string? ExpectedJournalId,
    string? ExpectedCheckpoint,
    long ExpectedCatalogRevision,
    string NextCheckpoint,
    string SnapshotId,
    IReadOnlyList<CatalogNodeRecord> Nodes);

public sealed record CatalogVolumeObservation(
    string VolumeId,
    bool IsOnline,
    string? JournalId,
    bool StoredCheckpointContinuous);

public sealed record CatalogTaskRecord(
    string TaskId,
    string VolumeId,
    string Kind,
    string Phase,
    long Processed,
    long? Total,
    long StartedUtcTicks,
    long? CompletedUtcTicks,
    string? ErrorCode);
