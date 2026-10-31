using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Localization;

// Pure presentation of existing state snapshots. No tasks, subscriptions or IO.
internal static class MaintenanceText
{
    public static string ControlKey(MetadataPanelState? state)=>state?.Progress.Phase switch {"failed"=>"ui.metadata.retry","paused"=>"ui.metadata.resume",_=>"ui.metadata.pause"};
    public static string TitleKey(MetadataPanelState state)=>state.Progress.Phase switch {
        "idle"=>"ui.metadata.idle","preparing"=>"ui.metadata.preparing","discovering"=>"ui.metadata.discovering",
        "waiting"=>"ui.metadata.waiting","extracting"=>"ui.metadata.extracting","pausing"=>"ui.metadata.pausing",
        "paused"=>state.Pending>0||state.HasPolicy?"ui.metadata.paused":"ui.metadata.idle",
        "completed"=>"ui.metadata.completed","failed"=>"ui.metadata.failed",_=>"ui.metadata.readingUnknown"
    };
    public static string Counts(MetadataPanelState state,LanguageSession language)
    {
        var p=state.Progress;
        var key=p.Phase=="discovering"?"ui.metadata.discovered":p.Total is not null?"ui.metadata.processedTotal":"ui.metadata.processed";
        var text=language.Text(key,new Dictionary<string,object?>{{"count",p.Phase=="discovering"?p.Discovered:p.Processed},{"total",p.Total}});
        if(p.Phase=="discovering")return text;
        if(p.Failed>0)text+=language.Text("ui.metadata.failedCount",new Dictionary<string,object?>{{"count",p.Failed}});
        if(p.Unsupported>0)text+=language.Text("ui.metadata.unsupportedCount",new Dictionary<string,object?>{{"count",p.Unsupported}});
        return text;
    }
    public static string Error(string code,LanguageSession language)
    {
        var key=code switch {
            "metadata-exclusions-limit"=>"ui.exclusions.limit",
            "index-ui-disconnected"=>"ui.index.disconnected","index-ui-isolated"=>"ui.index.isolated","index-ui-no-volumes"=>"ui.index.chooseVolumes",
            "metadata-directory-unavailable"=>"ui.metadata.errorDirectoryUnavailable",
            "metadata-directory-changed"=>"ui.metadata.errorDirectoryChanged",
            "metadata-directory-state-unavailable" or "metadata-build-preferences-unavailable"=>"ui.metadata.errorState",
            "metadata-build-not-paused"=>"ui.metadata.errorNotPaused","metadata-directory-queue-full"=>"ui.metadata.errorQueueFull",
            "metadata-directory-failed" or "metadata-build-failed"=>"ui.metadata.errorFailed",
            _=>code.StartsWith("metadata-",StringComparison.Ordinal)?"ui.metadata.errorGeneric":"ui.error.operationFailed"
        };
        return language.Text(key);
    }
    public static string TaskKindKey(string kind)=>kind switch {
        "rebuild"=>"ui.index.kind.rebuild","synchronize"=>"ui.index.kind.synchronize",
        "build" or "initial"=>"ui.index.kind.build",_=>"ui.index.kind.unknown"
    };
    public static string TaskStateKey(string state)=>state switch {
        "running"=>"ui.index.state.running","completed"=>"ui.index.state.completed","cancelled"=>"ui.index.state.cancelled",
        "failed"=>"ui.index.state.failed","pending" or "queued"=>"ui.index.state.pending",_=>"ui.index.state.unknown"
    };
    public static string VolumeStateKey(string state)=>state switch {
        "disabled"=>"ui.index.volume.disabled","discovering"=>"ui.index.volume.discovering","building"=>"ui.index.volume.building",
        "ready"=>"ui.index.volume.ready","catchingUp"=>"ui.index.volume.catchingUp","offline"=>"ui.index.volume.offline",
        "degraded"=>"ui.index.volume.degraded","needsRebuild"=>"ui.index.volume.needsRebuild",_=>"ui.index.state.unknown"
    };
    public static string RuntimeKey(string status)=>status switch {
        "missing_root"=>"ui.model.runtime.missingRoot","missing_server"=>"ui.model.runtime.missingServer",
        "unselected"=>"ui.model.runtime.unselected","selection_missing"=>"ui.model.runtime.selectionMissing",
        "available"=>"ui.model.runtime.available",_=>"ui.model.runtime.unknown"
    };
}
