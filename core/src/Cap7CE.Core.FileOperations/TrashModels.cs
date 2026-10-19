namespace Cap7CE.Core.FileOperations;

public sealed record TrashTarget(string Path, bool IsDirectory);
public sealed record TrashFailure(string Path, string Code, int Error = 0);
public sealed record TrashBatchResult(bool Success, int TotalCount, IReadOnlyList<string> DeletedPaths, IReadOnlyList<TrashFailure> FailedItems);
public sealed class TrashException(string code, int nativeError = 0) : Exception(code)
{
    public int NativeError { get; } = nativeError;
}
