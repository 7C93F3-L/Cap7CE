using Cap7CE.WinUI.Localization;
using System.Text.Json;
using Cap7CE.WinUI.Models;
namespace Cap7CE.WinUI.Services;
internal sealed class VisualConnection : IAsyncDisposable
{
    public static string CacheRoot => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Cap7CE-PhaseF", "visual-cache");
    private readonly CoreNodeHost host;
    public object Diagnostics=>host.Diagnostics;
    public bool IsActive=>host.IsActive;
    private readonly string cacheRoot;
    private readonly SemaphoreSlim slots = new(2);
    public VisualConnection(string root,string? cacheRoot=null) { this.cacheRoot=Path.GetFullPath(cacheRoot??CacheRoot);host = new(root, "visual-cache.cjs", this.cacheRoot); }
    public async Task<string> PrepareAsync(string path, bool preview, CancellationToken token)
    {
        await slots.WaitAsync(token);
        try
        {
            // Preserve the registry's Shell providers for RAW/HEIC and other system formats.
            var format = FormatRegistry.Find(Path.GetExtension(path));
            var shell = format?.CanShellPreview == true || (!preview && format?.CanThumbnail != true);
            var value = await host.RequestAsync(shell ? "ensureShell" : "ensure",
                [path, shell ? (preview ? "skim-shell-preview" : "skim-shell-thumbnail") : preview ? "skim-preview" : "skim-thumbnail"]);
            token.ThrowIfCancellationRequested();
            var image = Path.GetFullPath(value.GetProperty("imagePath").GetString()!);
            if (!image.StartsWith(cacheRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new UiFailure("ui.error.imagePath");
            return image;
        }
        finally { slots.Release(); }
    }
    public async Task<(int Width,int Height)?> ReadDimensionsAsync(string path,CancellationToken token)
    {
        var value=await host.RequestAsync("sourceDimensions",[path],token);token.ThrowIfCancellationRequested();
        if(value.ValueKind==JsonValueKind.Null)return null;
        if(value.ValueKind!=JsonValueKind.Object||!value.TryGetProperty("width",out var w)||!value.TryGetProperty("height",out var h)
            ||!w.TryGetInt32(out var width)||!h.TryGetInt32(out var height)||width<=0||height<=0)return null;
        return (width,height);
    }
    public Task<JsonElement> RequestAsync(string method, params object?[] args) => host.RequestAsync(method, args);
    public Task ReleaseAsync() => host.ReleaseAsync();
    public async Task ClearAsync()
    {
        await slots.WaitAsync();await slots.WaitAsync();
        try {await host.ReleaseAsync();await host.RequestAsync("clear",[]);await host.RequestAsync("clearSkim",[]);}
        finally{slots.Release(2);}
    }
    public ValueTask DisposeAsync() => host.DisposeAsync();
}
