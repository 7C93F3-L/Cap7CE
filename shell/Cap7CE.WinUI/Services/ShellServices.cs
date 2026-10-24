using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;

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
    public CoreNodeHost StoredMetadata {get;}
    public FavoriteService Favorites { get; }
    public MetadataTasks Metadata {get;}
    public NativeNotifications Notifications {get;}=new();
    public NativeHotKeys? Shortcuts {get;set;}
    public event Action<IReadOnlySet<string>?>? CatalogChanged;
    public void RefreshViews()=>CatalogChanged?.Invoke(null);
    private long catalogRevision;
    public event Action<string>? BackgroundError;
    public event Action<bool>? VisualMaintenance;
    public event Action<string?>? MaintenanceRequested;
    public void ShowMaintenance(string? path=null)=>MaintenanceRequested?.Invoke(path);
    private CatalogChangeSubscription? changes;
    public HashSet<string> DeletedPaths { get; } = new(StringComparer.OrdinalIgnoreCase);
    private readonly SemaphoreSlim connection = new(1);
    private bool closed;
    public IReadOnlyList<CoreVolumeStatus> Volumes { get; private set; } = [];
    public ShellServices(string root)
    {
        Root = root; Visuals = new(root); Favorites = new(root);Metadata=new(this);
        Providers = new(root, "provider-preview.cjs", Path.GetTempPath());
        Models = new(root, "model-runtime.cjs", PreferenceStore.ProductData);
        Office = new(root, "office-preview.cjs", Path.Combine(PreferenceStore.DataRoot, "temp"));
        StoredMetadata=new(root,"visual-cache.cjs",PreferenceStore.ProductData);
    }
    public async Task ConnectAsync(bool onlyIfDisconnected=false)
    {
        await connection.WaitAsync();
        try {
        ObjectDisposedException.ThrowIf(closed, this);
        if(onlyIfDisconnected&&Core?.IsConnected==true)return;
        changes?.Dispose();changes=null;
        if(Core is not null){await Core.DisposeAsync();Core=null;}
        var database = Environment.GetEnvironmentVariable("CAP7CE_PHASEF_CATALOG") ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Cap7CE/Core/v1/catalog.db");
        Core = await CoreConnection.StartAsync(Root, database, interactive: true,product:Environment.GetEnvironmentVariable("CAP7CE_PHASEF_CATALOG") is null,failureLog:NativeDiagnostics.CoreFailure); await RefreshVolumesAsync();
        changes=new(Core,OnCatalogChanged,error=>BackgroundError?.Invoke("目录同步连接已结束："+error.Message));
        } finally { connection.Release(); }
    }
    public async Task RefreshVolumesAsync()
    { if (Core is not null) {var status=await Core.RequestAsync<CatalogStatusResponse>(CoreOperations.CatalogStatus,new{});Volumes=status.Volumes;catalogRevision=status.CatalogRevision;} }
    public async Task DisconnectAsync()
    {
        await connection.WaitAsync();
        try{changes?.Dispose();changes=null;if(Core is not null)await Core.DisposeAsync();Core=null;}
        finally{connection.Release();}
    }
    private async Task OnCatalogChanged()
    {
        if(closed)return;var owner=Core;
        try{
            var before=Volumes;var previousRevision=catalogRevision;
            await RefreshVolumesAsync();if(closed||!ReferenceEquals(owner,Core))return;
            static CatalogVolumeStamp Stamp(CoreVolumeStatus v)=>new(v.VolumeId,v.DisplayName,v.CatalogRevision,v.Queryable,v.State);
            CatalogChanged?.Invoke(CatalogRefreshRules.Changes(before.Select(Stamp).ToArray(),Volumes.Select(Stamp).ToArray(),previousRevision!=catalogRevision));
            await Metadata.NotifyAsync();
        }catch(Exception error){if(!closed)BackgroundError?.Invoke(error.Message);}
    }
    public async Task ReleaseSourcesAsync() { await Providers.ReleaseAsync(); await Office.ReleaseAsync(); await Visuals.ReleaseAsync(); }
    public async Task<(long Count,long Bytes)> GetCacheStatsAsync()
    {
        var replies=await Task.WhenAll(Visuals.RequestAsync("stats"),Visuals.RequestAsync("skimStats"),Office.RequestAsync("cache.stats",[]));
        return (replies.Sum(r=>r.GetProperty("cacheCount").GetInt64()),replies.Sum(r=>r.GetProperty("totalBytes").GetInt64()));
    }
    public async Task ClearVisualCacheAsync()
    {
        VisualMaintenance?.Invoke(true);
        try{await ReleaseSourcesAsync();await Visuals.ClearAsync();await Office.RequestAsync("cache.clear",[]);Notify("缓存清理完成。");}
        finally{VisualMaintenance?.Invoke(false);}
    }
    public void Notify(string text)
    {try{Notifications.Show(text,Preferences.Current.Notifications);}catch(Exception error){BackgroundError?.Invoke("通知发送失败："+error.Message);}}
    public async ValueTask DisposeAsync()
    {
        await connection.WaitAsync();
        try { if (closed) return; closed = true;changes?.Dispose(); if (Core is not null) await Core.DisposeAsync(); Core = null; }
        finally { connection.Release(); }
        Shortcuts?.Dispose();Notifications.Dispose();await Providers.DisposeAsync(); await Office.DisposeAsync(); await Models.DisposeAsync(); await Visuals.DisposeAsync();await StoredMetadata.DisposeAsync();
    }
}
