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
    public AutoKeywordTasks AutoKeywords {get;}
    public object ModelContext=>ModelContextFor(Localization.AppLanguage.Session.Current);
    public object ModelContextFor(string language)=>new{runtimeRoot=Path.Combine(Root,"llama.cpp"),modelsRoot=Path.Combine(Root,"models"),language};
    public NativeNotifications Notifications {get;}=new();
    public NativeHotKeys? Shortcuts {get;set;}
    public event Action<CatalogRefreshImpact>? CatalogChanged;
    public event Action<CatalogStatusResponse>? IndexStatusChanged;
    public event Action? ConnectionChanged;
    public void RefreshViews()=>CatalogChanged?.Invoke(new(null));
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
        Root = root; Visuals = new(root); Favorites = new(root);Metadata=new(this);AutoKeywords=new(this);
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
        Core = await CoreConnection.StartAsync(Root, database, interactive: true,product:Environment.GetEnvironmentVariable("CAP7CE_PHASEF_CATALOG") is null,failureLog:NativeDiagnostics.CoreFailure,runtimeLog:NativeDiagnostics.CoreRuntimeFailure); await RefreshVolumesAsync();
        changes=new(Core,OnCatalogChanged,error=>BackgroundError?.Invoke("后台同步已断开，当前列表已保留。可刷新重试；若仍失败，请到诊断页重新连接。"));
        } finally { connection.Release();ConnectionChanged?.Invoke(); }
    }
    public async Task RefreshVolumesAsync()
    { if (Core is not null) {var status=await Core.RequestAsync<CatalogStatusResponse>(CoreOperations.CatalogStatus,new{});Volumes=status.Volumes;catalogRevision=status.CatalogRevision;IndexStatusChanged?.Invoke(status);} }
    public async Task DisconnectAsync()
    {
        await connection.WaitAsync();
        try{changes?.Dispose();changes=null;if(Core is not null)await Core.DisposeAsync();Core=null;}
        finally{connection.Release();ConnectionChanged?.Invoke();}
    }
    private async Task OnCatalogChanged(CatalogChangeNotice notice)
    {
        if(closed)return;var owner=Core;
        try{
            if(notice.Scopes is {Count:>0} scopes&&scopes.All(s=>Volumes.Any(v=>v.VolumeId==s.VolumeId&&v.Queryable&&v.Selected))) {
                var precise=scopes.Select(s=>new CatalogPathChange(Volumes.First(v=>v.VolumeId==s.VolumeId).DisplayName,s.RelativePaths)).ToArray();
                CatalogChanged?.Invoke(new(null,precise));return;
            }
            var before=Volumes;var previousRevision=catalogRevision;
            await RefreshVolumesAsync();if(closed||!ReferenceEquals(owner,Core))return;
            static CatalogVolumeStamp Stamp(CoreVolumeStatus v)=>new(v.VolumeId,v.DisplayName,v.CatalogRevision,v.Queryable,v.State);
            var roots=CatalogRefreshRules.Changes(before.Select(Stamp).ToArray(),Volumes.Select(Stamp).ToArray(),previousRevision!=catalogRevision);
            var stable=before.Select(v=>(v.VolumeId,v.DisplayName,v.Queryable,v.State,v.Selected)).OrderBy(v=>v.VolumeId)
                .SequenceEqual(Volumes.Select(v=>(v.VolumeId,v.DisplayName,v.Queryable,v.State,v.Selected)).OrderBy(v=>v.VolumeId));
            List<CatalogPathChange>? paths=notice.Scopes is not null&&stable?[]:null;
            if(paths is not null)foreach(var scope in notice.Scopes!) {
                var volume=Volumes.FirstOrDefault(v=>v.VolumeId==scope.VolumeId);
                if(volume is null){paths=null;break;}paths.Add(new(volume.DisplayName,scope.RelativePaths));
            }
            CatalogChanged?.Invoke(new(roots,paths));
            if(notice.Scopes is null)await Metadata.NotifyAsync();
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
        await AutoKeywords.DisposeAsync();
        await connection.WaitAsync();
        try { if (closed) return; closed = true;changes?.Dispose(); if (Core is not null) await Core.DisposeAsync(); Core = null; }
        finally { connection.Release(); }
        Shortcuts?.Dispose();Notifications.Dispose();await Providers.DisposeAsync(); await Office.DisposeAsync(); await Models.DisposeAsync(); await Visuals.DisposeAsync();await StoredMetadata.DisposeAsync();
    }
}
