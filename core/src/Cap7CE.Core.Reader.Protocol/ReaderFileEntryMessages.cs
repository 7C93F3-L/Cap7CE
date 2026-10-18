namespace Cap7CE.Core.Reader.Protocol;

public enum ReaderFileEntryState : uint { Complete, Missing, Unavailable, OverLimit }
public sealed record ReaderFileEntrySet(ulong FileReference, ReaderFileEntryState State,
    uint LinkCount, ulong? SizeBytes, long? CreationFileTimeUtc, long? LastWriteFileTimeUtc,
    IReadOnlyList<ReaderFileName> Names);
public sealed record ReaderFileEntryBatchRequest(ReaderOpaqueId VolumeId, IReadOnlyList<ulong> FileReferences, uint StartIndex = 0);
public sealed record ReaderFileEntryBatchResponse(uint NextIndex, bool EndOfBatch, IReadOnlyList<ReaderFileEntrySet> Files);
