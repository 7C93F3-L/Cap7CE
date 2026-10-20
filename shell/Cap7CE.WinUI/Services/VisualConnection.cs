using System.Text.Json;
namespace Cap7CE.WinUI.Services;
internal sealed class VisualConnection : IAsyncDisposable
{
    public static string CacheRoot => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Cap7CE-PhaseF", "visual-cache");
    private readonly CoreNodeHost host;
    private readonly SemaphoreSlim slots = new(2);
    public VisualConnection(string root) { host = new(root, "visual-cache.cjs", CacheRoot); }
    public async Task<string> PrepareAsync(string path, bool preview, CancellationToken token)
    {
        await slots.WaitAsync(token);
        try
        {
            var value = await host.RequestAsync("ensure", [path, preview ? "skim-preview" : "skim-thumbnail"]);
            token.ThrowIfCancellationRequested();
            var image = Path.GetFullPath(value.GetProperty("imagePath").GetString()!);
            if (!image.StartsWith(CacheRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new IOException("Core 图像越界");
            return image;
        }
        finally { slots.Release(); }
    }
    public Task<JsonElement> RequestAsync(string method, params object?[] args) => host.RequestAsync(method, args);
    public Task ReleaseAsync() => host.ReleaseAsync();
    public ValueTask DisposeAsync() => host.DisposeAsync();
}
