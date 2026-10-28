using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Localization;

internal static class ProgressText
{
    public static string AutoBusy(AutoKeywordState state,bool cancelling,LanguageSession language)
        =>language.Text(cancelling?"ui.progress.autoCancelling":"ui.progress.autoRunning")
        +(state.Total>1?language.Text("ui.progress.autoFraction",new Dictionary<string,object?>{{"count",state.Processed},{"total",state.Total}}):"");
    public static string AutoFinished(AutoKeywordState state,LanguageSession language)
    {
        if(state.Phase=="已取消")return language.Text("ui.progress.autoCancelled");
        if(state.Phase=="失败")return language.Text(state.Message.Length>0?"ui.progress.autoError":"ui.progress.autoFailed",new Dictionary<string,object?>{{"error",state.Message}});
        var failures=state.Failed+state.Skipped;
        return language.Text(failures>0?"ui.progress.autoFailedFiles":"ui.progress.autoCompleted",new Dictionary<string,object?>{{"count",failures>0?failures:state.Succeeded}});
    }
    public static string MetadataBusy(MetadataTaskStatus state,LanguageSession language)
    {
        var key=state.Phase switch {
            "preparing"=>"ui.progress.metadataPreparing","discovering"=>"ui.progress.metadataDiscovering",
            "waiting"=>"ui.progress.metadataWaiting","pausing"=>"ui.progress.metadataPausing",
            _=>state.Total is >0?"ui.progress.metadataTotal":"ui.progress.metadataUnknownTotal"
        };
        return language.Text(key,new Dictionary<string,object?>{{"count",state.Phase=="discovering"?state.Discovered:state.Processed},{"total",state.Total}});
    }
    public static string MetadataFinished(MetadataTaskStatus state,LanguageSession language)
    {
        if(state.Operation=="cancelDirectories")return language.Text("ui.progress.metadataQueueCancelled");
        if(state.Phase=="paused")return language.Text("ui.progress.metadataPaused");
        if(state.Phase=="failed")return language.Text(state.ErrorCode is null?"ui.progress.metadataFailed":"ui.progress.metadataError",new Dictionary<string,object?>{{"error",state.ErrorCode}});
        if(state.Phase!="completed")return language.Text("ui.progress.metadataStopped");
        var text=language.Text("ui.progress.metadataCompleted");
        if(state.Failed>0)text+=language.Text("ui.progress.metadataFailedFiles",new Dictionary<string,object?>{{"count",state.Failed}});
        if(state.Unsupported>0)text+=language.Text("ui.progress.metadataUnsupported",new Dictionary<string,object?>{{"count",state.Unsupported}});
        return text;
    }
    public static string IndexStageKey(string? stage)=>stage switch {
        "preparing"=>"ui.progress.indexPreparing","scanning"=>"ui.progress.indexScanning","publishing"=>"ui.progress.indexPublishing",
        "syncing"=>"ui.progress.indexSyncing",_=>"ui.progress.indexRunning"
    };
}
