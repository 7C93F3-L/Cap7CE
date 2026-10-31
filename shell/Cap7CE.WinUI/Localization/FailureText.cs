namespace Cap7CE.WinUI.Localization;

internal static class FailureText
{
    public static UiMessage From(Exception error)
    {
        if(error is IUiFailure localized)return localized.Display;
        var systemKey=error switch {OperationCanceledException=>"ui.error.cancelled",UnauthorizedAccessException=>"ui.error.accessDenied",
            FileNotFoundException=>"ui.error.fileMissing",DirectoryNotFoundException=>"ui.error.directoryMissing",TimeoutException=>"ui.error.operationTimeout",_=>null};
        if(systemKey is not null)return UiMessage.Key(systemKey);
        // CoreMessage can contain raw provider diagnostics. Recognize only this existing code.
        if(error.Data["CoreMessage"] as string=="directory-browse-capacity-exceeded")return UiMessage.Key("ui.error.browseCapacity");
        var code=error.Message;
        if(code=="invalid-native-filter-data")return UiMessage.Key("ui.error.filterResource");
        if(code=="directory-browse-capacity-exceeded")return UiMessage.Key("ui.error.browseCapacity");
        if(code is "favorite-directories-order-changed" or "favorite-directory-invalid-order")return UiMessage.Key("ui.error.favoriteOrder");
        return UiMessage.Snapshot(language=>MaintenanceText.Error(code,language));
    }
    public static UiMessage Refresh(Exception error)=>error.Message=="invalid-cursor"
        ?UiMessage.Key("ui.error.pageCursor"):UiMessage.Key("ui.error.refresh",new Dictionary<string,object?>{{"error",From(error)}});
    public static UiMessage Keyword(Exception error)=>error is IUiFailure?From(error):UiMessage.Key("ui.error.autoGeneric");
    public static string ScopeKey(string? state,bool random)=>state switch {
        "needsRebuild"=>random?"ui.error.scopeRebuildRandom":"ui.error.scopeRebuild",
        "building"=>random?"ui.error.scopeBuildingRandom":"ui.error.scopeBuilding",
        _=>random?"ui.error.scopeRandom":"ui.error.scopeUnavailable"
    };
}
