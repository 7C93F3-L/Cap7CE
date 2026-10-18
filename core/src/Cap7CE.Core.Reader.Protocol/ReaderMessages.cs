namespace Cap7CE.Core.Reader.Protocol;

public readonly record struct ReaderOpaqueId(ulong First, ulong Second)
{
    public bool IsEmpty => First == 0 && Second == 0;
}

[Flags]
public enum ReaderCapabilities : uint
{
    None = 0,
    SnapshotPaging = 1,
    JournalPaging = 2,
    SyntheticFixture = 4,
    MultiVolume = 8,
    BasicFacts = 16,
    JournalChangeWait = 32,
    FileEntryNames = 64
}

public sealed record ReaderHelloRequest(byte[] Nonce, uint ClientProcessId);

public sealed record ReaderHelloResponse(
    byte[] Nonce,
    uint ServerProcessId,
    uint MaximumPayloadBytes,
    uint MaximumRecordsPerPage,
    ReaderCapabilities Capabilities);

public sealed record ReaderStatusResponse(
    bool Ready,
    bool FixtureOnly,
    bool RemoteClientsRejected,
    bool ClientAuthenticated,
    uint SchemaVersion,
    ReaderOpaqueId PrimaryVolumeId);

public sealed record ReaderVolumeInspectRequest(ReaderOpaqueId VolumeId);

public sealed record ReaderVolumeInspectResponse(
    ReaderOpaqueId VolumeId,
    ulong RecordCount,
    ulong JournalId,
    bool Supported,
    bool JournalAvailable);

public sealed record ReaderVolumeInspectResponseV2(
    ReaderOpaqueId VolumeId,
    ulong RecordCount,
    ulong JournalId,
    long FirstUsn,
    long LowestValidUsn,
    long NextUsn,
    bool Supported,
    bool JournalAvailable);

public sealed record ReaderVolumeDescriptor(
    ReaderOpaqueId VolumeId,
    string DisplayName,
    bool Fixed,
    bool Ntfs,
    bool JournalAvailable);

public sealed record ReaderVolumeEnumerateResponse(
    IReadOnlyList<ReaderVolumeDescriptor> Volumes);

public sealed record ReaderMftOpenSnapshotRequest(ReaderOpaqueId VolumeId);

public sealed record ReaderMftOpenSnapshotResponse(
    ReaderOpaqueId SnapshotId,
    ulong RecordCount,
    ulong JournalId,
    long JournalStartingUsn);

public sealed record ReaderMftReadPageRequest(
    ReaderOpaqueId SnapshotId,
    ulong Cursor,
    uint MaximumRecords);

public sealed record ReaderMftRecord(
    ulong FileReference,
    ulong ParentFileReference,
    ulong SizeBytes,
    long LastWriteFileTimeUtc,
    uint Attributes,
    bool IsDirectory,
    string Name,
    string Extension);

public sealed record ReaderMftRecordV2(
    ulong FileReference,
    ulong ParentFileReference,
    ulong? SizeBytes,
    long? CreationFileTimeUtc,
    long? LastWriteFileTimeUtc,
    uint Attributes,
    bool IsDirectory,
    string Name,
    string Extension);

public sealed record ReaderMftReadPageResponseV2(
    ulong NextCursor,
    bool EndOfStream,
    IReadOnlyList<ReaderMftRecordV2> Records);

public sealed record ReaderMftReadPageResponse(
    ulong NextCursor,
    bool EndOfStream,
    IReadOnlyList<ReaderMftRecord> Records);

public sealed record ReaderMftCloseSnapshotRequest(ReaderOpaqueId SnapshotId);

public sealed record ReaderJournalReadBatchRequest(
    ReaderOpaqueId VolumeId,
    ulong JournalId,
    long StartingUsn,
    uint MaximumRecords);

public sealed record ReaderJournalRecord(
    ulong FileReference,
    ulong ParentFileReference,
    uint Reason,
    long Usn,
    uint Attributes,
    bool IsDirectory,
    string Name);

public sealed record ReaderJournalRecordV2(
    ulong FileReference,
    ulong ParentFileReference,
    uint Reason,
    long Usn,
    uint Attributes,
    bool IsDirectory,
    bool Exists,
    string Name,
    string Extension,
    ulong? SizeBytes,
    long? CreationFileTimeUtc,
    long? LastWriteFileTimeUtc);

public sealed record ReaderJournalReadBatchResponseV2(
    ulong JournalId,
    long FirstUsn,
    long LowestValidUsn,
    long NextUsn,
    bool Continuous,
    IReadOnlyList<ReaderJournalRecordV2> Records);

public sealed record ReaderJournalReadBatchResponse(
    ulong JournalId,
    long NextUsn,
    bool Continuous,
    IReadOnlyList<ReaderJournalRecord> Records);

public sealed record ReaderCancelRequest(ulong TargetRequestId);
