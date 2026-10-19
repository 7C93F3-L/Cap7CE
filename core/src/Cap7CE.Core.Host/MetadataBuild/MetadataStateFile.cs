namespace Cap7CE.Core.Host.MetadataBuild;

// One configured application file and exclusively-created staging files only; never source assets or Catalog.
internal sealed class MetadataStateFile
{
    internal const int MaximumBytes = 1024 * 1024;
    private readonly string path;
    private readonly SemaphoreSlim gate = new(1, 1);
    internal Func<string> CreateTemporaryPath { get; init; }
    internal MetadataStateFile(string path)
    {
        if (!Path.IsPathFullyQualified(path)) throw new ArgumentException("metadata-state-path-not-absolute");
        this.path = Path.GetFullPath(path); CreateTemporaryPath = () => $"{this.path}.{Guid.NewGuid():N}.tmp";
    }
    internal async Task<byte[]?> ReadAsync(CancellationToken token)
    {
        await gate.WaitAsync(token);
        try
        {
            await using var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, FileOptions.Asynchronous);
            var bytes = new byte[MaximumBytes + 1]; var length = 0;
            while (length < bytes.Length) { var read = await input.ReadAsync(bytes.AsMemory(length), token); if (read == 0) break; length += read; }
            if (length > MaximumBytes) throw new InvalidDataException("metadata-state-invalid");
            return bytes[..length];
        }
        catch (FileNotFoundException) { return null; }
        catch (DirectoryNotFoundException) { return null; }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or InvalidDataException) { throw new MetadataStateIOException("read", error); }
        finally { gate.Release(); }
    }
    internal async Task WriteAsync(byte[] bytes, CancellationToken token)
    {
        if (bytes.Length > MaximumBytes) throw new MetadataStateIOException("validate", new InvalidDataException("metadata-state-invalid"));
        await gate.WaitAsync(token); var temporary = ""; var created = false; var operation = "write";
        try
        {
            token.ThrowIfCancellationRequested(); Directory.CreateDirectory(Path.GetDirectoryName(path)!); temporary = CreateTemporaryPath();
            if (!string.Equals(Path.GetDirectoryName(Path.GetFullPath(temporary)), Path.GetDirectoryName(path), StringComparison.OrdinalIgnoreCase)
                || !Path.GetFileName(temporary).StartsWith(Path.GetFileName(path) + ".", StringComparison.Ordinal)) throw new InvalidDataException("metadata-state-stage-invalid");
            await using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.Asynchronous))
            { created = true; await output.WriteAsync(bytes, token); await output.FlushAsync(token); output.Flush(flushToDisk: true); }
            token.ThrowIfCancellationRequested(); operation = "replace"; File.Move(temporary, path, overwrite: true); created = false;
            // Publication is the commit point; a subsequent cancellation cannot reject a saved edit.
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or InvalidDataException) { throw new MetadataStateIOException(operation, error); }
        finally { if (created) { try { File.Delete(temporary); } catch (Exception error) when (error is IOException or UnauthorizedAccessException) { } } gate.Release(); }
    }
}
