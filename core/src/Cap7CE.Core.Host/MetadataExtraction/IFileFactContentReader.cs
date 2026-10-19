namespace Cap7CE.Core.Host.MetadataExtraction;

public interface IFileFactContentReader : IAsyncDisposable
{
    Task<FileFactExtractionResult> ReadAsync(FileFactExtractionTicket ticket, CancellationToken token);
    Task ReleaseAsync();
}

public sealed class FileFactWorkerException(string code) : Exception(code);
