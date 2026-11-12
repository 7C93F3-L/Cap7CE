using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;
internal sealed class ShellServices : IAsyncDisposable
{
    public DesktopActions.DesktopActionStore DesktopActions {get;}=new();
    public string Root { get; }
    public NativeUpdates Updates { get; }
    public AutomaticUpdateCheck AutomaticUpdates {get;}
    public PreferenceStore Preferences { get; } = new();
    public CoreConnection? Core { get; private set; }
    public VisualConnection Visuals { get; }
    public CoreNodeHost Providers { get; }
    public CoreNodeHost Models { get; }
    public ModelChanges ModelChanges {get;}=new();
    public CoreNodeHost Office { get; }
    public CoreNodeHost StoredMetadata {get;}
    public FavoriteService Favorites { get; }
    public MetadataTasks Metadata {get;}
    public AutoKeywordTasks AutoKeywords {get;}
    public object ModelContext=>ModelContextFor(Localization.AppLanguage.Session.Current);
    public object ModelContextFor(string language)=>new{runtimeRoot=Path.Combine(contentRoot,"llama.cpp"),modelsRoot=Path.Combine(contentRoot,"models"),language};
    private readonly string contentRoot;
    public NativeNotifications Notifications {get;}=new();
    public TaskNotifications TaskNotices {get;}
    public WindowShortcutService? Shortcuts {get;set;}
    public event Action<CatalogRefreshImpact>? CatalogChanged;
    public event Action<CatalogStatusResponse>? IndexStatusChanged;
    public CatalogChangeNotice? CatalogMaintenance {get;private set;}
    public event Action? CatalogMaintenanceChanged;
    public event Action? ConnectionChanged;
    public void RefreshViews()=>CatalogChanged?.Invoke(new(null));
    private long catalogRevision;
    public event Action<UiMessage>? BackgroundError;
    public event Action<bool>? VisualMaintenance;
    public event Action<string?>? MaintenanceRequested;
    public void ShowMaintenance(string? path=null)=>MaintenanceRequested?.Invoke(path);
    private CatalogChangeSubscription? changes;
    public DeletedPathTracker DeletedPaths { get; } = new();
    private readonly SemaphoreSlim connection = new(1);
    private bool closed;
    public IReadOnlyList<CoreVolumeStatus> Volumes { get; private set; } = [];
    public ShellServices(string root)
    {
        contentRoot=NativeContentPaths.Root(root);
        Updates=new(root);Root = root;TaskNotices=new(Notify); Visuals = new(root); Favorites = new(root);Metadata=new(this);AutoKeywords=new(this);
        AutomaticUpdates=new(()=>Preferences.Current,Preferences.UpdateAsync,Updates.CheckQuietlyAsync,
            version=>Notifications.ShowUpdate(UiMessage.Key("settings.updateAvailable",new Dictionary<string,object?>{{"version",version}}).Render(AppLanguage.Session),Preferences.Current.Notifications));
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
        TaskNotices.ForgetKind("index");TaskNotices.ForgetKind("metadata");
        changes?.Dispose();changes=null;CatalogMaintenance=null;
        if(Core is not null){await Core.DisposeAsync();Core=null;}
        var database = Environment.GetEnvironmentVariable("CAP7CE_PHASEF_CATALOG") ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Cap7CE/Core/v1/catalog.db");
        Core = await CoreConnection.StartAsync(Root, database, interactive: true,product:Environment.GetEnvironmentVariable("CAP7CE_PHASEF_CATALOG") is null,failureLog:NativeDiagnostics.CoreFailure,runtimeLog:NativeDiagnostics.CoreRuntimeFailure); await RefreshVolumesAsync();
        var changeOwner=Core;
        changes=new(Core,OnCatalogChanged,error=>BackgroundError?.Invoke(UiMessage.Key("ui.error.backgroundDisconnected")),
            state=>{if(!closed&&ReferenceEquals(changeOwner,Core)){CatalogMaintenance=state;CatalogMaintenanceChanged?.Invoke();}});
        try{await Metadata.RestoreAsync();}catch(Exception error){NativeDiagnostics.CoreFailure(error.ToString());BackgroundError?.Invoke(FailureText.From(error));}
        } finally { connection.Release();ConnectionChanged?.Invoke(); }
    }
    public async Task RefreshVolumesAsync()
    { var owner=Core;if(owner is not null){var status=await owner.RequestAsync<CatalogStatusResponse>(CoreOperations.CatalogStatus,new{});if(closed||!ReferenceEquals(owner,Core))return;Volumes=status.Volumes;catalogRevision=status.CatalogRevision;TaskNotices.IndexStatus(status.Tasks.Select(task=>(task.TaskId,task.State)));IndexStatusChanged?.Invoke(status);} }
    public async Task DisconnectAsync()
    {
        await connection.WaitAsync();
        try{TaskNotices.ForgetKind("index");TaskNotices.ForgetKind("metadata");changes?.Dispose();changes=null;CatalogMaintenance=null;if(Core is not null)await Core.DisposeAsync();Core=null;}
        finally{connection.Release();ConnectionChanged?.Invoke();}
    }
    private async Task OnCatalogChanged(CatalogChangeNotice notice)
    {
        if(closed)return;var owner=Core;
        try{
            try{await Metadata.NotifyAsync();}catch(Exception error){NativeDiagnostics.CoreFailure(error.ToString());}if(closed||!ReferenceEquals(owner,Core))return;
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
        }catch(Exception error){if(!closed)BackgroundError?.Invoke(FailureText.From(error));}
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
        try{await ReleaseSourcesAsync();await Visuals.ClearAsync();await Office.RequestAsync("cache.clear",[]);}
        finally{VisualMaintenance?.Invoke(false);}
    }
    public void Notify(UiMessage text)
    {try{Notifications.Show(text.Render(AppLanguage.Session),Preferences.Current.Notifications);}catch(Exception error){BackgroundError?.Invoke(UiMessage.Key("ui.error.notificationFailed",new Dictionary<string,object?>{{"error",FailureText.From(error)}}));}}
    public async ValueTask DisposeAsync()
    {
        TaskNotices.Clear();TaskNotices.IsObserved=_=>true;
        await AutomaticUpdates.DisposeAsync();await Updates.DisposeAsync();await AutoKeywords.DisposeAsync();
        await connection.WaitAsync();
        try { if (closed) return; closed = true;changes?.Dispose(); if (Core is not null) await Core.DisposeAsync(); Core = null; }
        finally { connection.Release(); }
        Shortcuts?.Dispose();Notifications.Dispose();await Providers.DisposeAsync(); await Office.DisposeAsync(); await Models.DisposeAsync(); await Visuals.DisposeAsync();await StoredMetadata.DisposeAsync();
    }
}
