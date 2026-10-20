using Cap7CE.Core.Protocol;

namespace Cap7CE.WinUI.Services;
internal sealed class ShellServices : IAsyncDisposable
{
    public string Root { get; }
    public PreferenceStore Preferences { get; } = new();
    public CoreConnection? Core { get; private set; }
    public VisualConnection Visuals { get; }
    public CoreNodeHost Providers { get; }
    public CoreNodeHost Models { get; }
    public CoreNodeHost Office { get; }
    public FavoriteService Favorites { get; }
    public HashSet<string> DeletedPaths { get; } = new(StringComparer.OrdinalIgnoreCase);
    private readonly SemaphoreSlim connection = new(1);
    private bool closed;
    public IReadOnlyList<CoreVolumeStatus> Volumes { get; private set; } = [];
    public ShellServices(string root)
    {
        Root = root; Visuals = new(root); Favorites = new(root);
        Providers = new(root, "provider-preview.cjs", Path.GetTempPath());
        Models = new(root, "model-runtime.cjs", PreferenceStore.ProductData);
        Office = new(root, "office-preview.cjs", Path.Combine(PreferenceStore.DataRoot, "temp"));
    }
    public async Task ConnectAsync()
    {
        await connection.WaitAsync();
        try {
        ObjectDisposedException.ThrowIf(closed, this);
        if(Core is not null){await Core.DisposeAsync();Core=null;}
        var database = Environment.GetEnvironmentVariable("CAP7CE_PHASEF_CATALOG") ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Cap7CE/Core/v1/catalog.db");
        Core = await CoreConnection.StartAsync(Root, database, interactive: true); await RefreshVolumesAsync();
        } finally { connection.Release(); }
    }
    public async Task RefreshVolumesAsync()
    { if (Core is not null) Volumes = (await Core.RequestAsync<CatalogStatusResponse>(CoreOperations.CatalogStatus, new { })).Volumes; }
    public async Task ReleaseSourcesAsync() { await Providers.ReleaseAsync(); await Office.ReleaseAsync(); await Visuals.ReleaseAsync(); }
    public async ValueTask DisposeAsync()
    {
        await connection.WaitAsync();
        try { if (closed) return; closed = true; if (Core is not null) await Core.DisposeAsync(); Core = null; }
        finally { connection.Release(); }
        await Providers.DisposeAsync(); await Office.DisposeAsync(); await Models.DisposeAsync(); await Visuals.DisposeAsync();
    }
}
