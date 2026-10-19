namespace Cap7CE.Core.Host.MetadataBuild;

public sealed record MetadataDirectoryStorageError(string Operation, string Code);
public sealed class MetadataDirectoryStateException : IOException
{
    public MetadataDirectoryStorageError Details { get; }
    internal MetadataDirectoryStateException(string operation, Exception cause) : base("metadata-directory-state-unavailable", cause)
        => Details = cause is MetadataStateIOException storage ? storage.Details : new(operation, "INVALID_STATE");
}
internal sealed class MetadataStateIOException : IOException
{
    internal MetadataDirectoryStorageError Details { get; }
    internal MetadataStateIOException(string operation, Exception cause) : base("metadata-state-io-failed", cause)
        => Details = new(operation, cause is InvalidDataException ? "INVALID_STATE" : cause is UnauthorizedAccessException ? "EACCES" : (cause.HResult & 0xffff) switch
        { 2 or 3 => "ENOENT", 5 => "EACCES", 32 or 33 => "EBUSY", 39 or 112 => "ENOSPC", 19 => "EROFS", 80 or 183 => "EEXIST", 206 => "ENAMETOOLONG", _ => "UNKNOWN" });
}
