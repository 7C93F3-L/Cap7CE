namespace Cap7CE.Core.Configuration;

// Only the configured application JSON and this writer's own staging file are accessed.
public sealed class FavoriteConfigurationFile(string path)
{
    internal Func<string> CreateTemporaryPath { get; init; } = () => $"{path}.{Guid.NewGuid():D}.pending";
    public async Task<IReadOnlyList<FavoriteDirectory>> ReadAsync(CancellationToken token)
    {
        FileStream input;
        try { input = new(path, FileMode.Open, FileAccess.Read, FileShare.Read, 4096, FileOptions.Asynchronous); }
        catch (FileNotFoundException) { return []; }
        catch (DirectoryNotFoundException) { return []; }
        await using (input)
        {
            var buffer = new byte[FavoriteDirectoryRules.MaximumBytes + 1]; var length = 0;
            while (length < buffer.Length)
            {
                var count = await input.ReadAsync(buffer.AsMemory(length), token); if (count == 0) break; length += count;
            }
            if (length > FavoriteDirectoryRules.MaximumBytes) throw new FavoriteConfigurationException("favorite-directories-state-too-large");
            return FavoriteDirectoryJson.Read(buffer.AsSpan(0, length));
        }
    }
    public async Task WriteAsync(IReadOnlyList<FavoriteDirectory> items, CancellationToken token)
    {
        FavoriteDirectoryRules.Validate(items); var bytes = FavoriteDirectoryJson.Write(items);
        token.ThrowIfCancellationRequested();
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        var temporary = CreateTemporaryPath(); var created = false;
        try
        {
            await using (var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.Asynchronous))
            {
                created = true; await output.WriteAsync(bytes, token); await output.FlushAsync(token); output.Flush(flushToDisk: true);
            }
            token.ThrowIfCancellationRequested(); File.Move(temporary, path, overwrite: true);
            // Publication is the commit point: cancellation after it must not report a rejected edit.
        }
        finally { if (created && File.Exists(temporary)) File.Delete(temporary); }
    }
}
