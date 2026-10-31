using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;

internal static class MaintenanceLanguageChecks
{
    public static void Run(LanguageCatalog catalog)
    {
        var language=new LanguageSession(catalog);var count=0;
        foreach(var phase in new[]{"idle","preparing","discovering","waiting","extracting","pausing","paused","completed","failed","future-phase"})
        foreach(var pending in new[]{0,2})foreach(var policy in new[]{false,true})foreach(var total in new long?[]{null,12}) {
            var progress=new MetadataTaskStatus(phase,7,9,2,1,total,null,null,false,"status");
            var state=new MetadataPanelState(progress,pending>0?"E:\\目录":null,pending,policy);
            if(string.IsNullOrWhiteSpace(language.Text(MaintenanceText.TitleKey(state)))||string.IsNullOrWhiteSpace(language.Text(MaintenanceText.ControlKey(state))))throw new Exception("Every state must resolve title/control resources.");
            var counts=MaintenanceText.Counts(state,language);
            if(!counts.Contains(phase=="discovering"?"9":"7"))throw new Exception("Task counts must report discovery separately from processed work.");count++;
            var before=state;
            language.Select("en-US","zh-CN");
            if(MaintenanceText.Counts(state,language).Contains('项'))throw new Exception("Chinese count copy leaked into English.");
            if(state!=before||state.Progress!=progress)throw new Exception("Formatting must preserve the task snapshot.");
            language.Select("zh-CN","zh-CN");
        }
        foreach(var code in new[]{"metadata-directory-unavailable","metadata-directory-changed","metadata-directory-state-unavailable","metadata-build-preferences-unavailable","metadata-build-not-paused","metadata-directory-queue-full","metadata-directory-failed","metadata-build-failed","metadata-future-code"})
            if(MaintenanceText.Error(code,language)==code)throw new Exception($"Metadata error code was not localized: {code}");
        Equal(MaintenanceText.Error("未知内部错误 {name}",language),language.Text("ui.error.operationFailed"));
        language.Select("en-US","zh-CN");
        if(!language.Text(MaintenanceText.RuntimeKey("selection_missing"),new Dictionary<string,object?>{{"name","版本甲"}}).Contains("版本甲"))throw new Exception("Runtime names must retain their original content.");
        if(MaintenanceText.RuntimeKey("future-state")==MaintenanceText.RuntimeKey("available"))throw new Exception("Unknown runtime states must not imply availability.");
        Console.WriteLine($"Maintenance text passed: {count} metadata snapshot combinations resolve resources and preserve counts/state; errors and runtime names remain explicit.");
    }
    private static void Equal(string actual,string expected){if(actual!=expected)throw new Exception($"Expected {expected}, got {actual}.");}
}
