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
            Equal(language.Text(MaintenanceText.TitleKey(state)),state.Title);
            Equal(language.Text(MaintenanceText.ControlKey(state)),state.ControlText);
            Equal(MaintenanceText.Counts(state,language),state.Counts);count++;
            var before=state;
            language.Select("en-US","zh-CN");
            if(MaintenanceText.Counts(state,language).Contains('项'))throw new Exception("Chinese count copy leaked into English.");
            if(state!=before||state.Progress!=progress)throw new Exception("Formatting must preserve the task snapshot.");
            language.Select("zh-CN","zh-CN");
        }
        foreach(var code in new[]{"metadata-directory-unavailable","metadata-directory-changed","metadata-directory-state-unavailable","metadata-build-preferences-unavailable","metadata-build-not-paused","metadata-directory-queue-full","metadata-directory-failed","metadata-build-failed","metadata-future-code"})
            Equal(MaintenanceText.Error(code,language),MetadataPanelState.DescribeError(code));
        Equal(MaintenanceText.Error("用户提供的目录 {name}",language),"用户提供的目录 {name}");
        language.Select("en-US","zh-CN");
        Equal(language.Text(MaintenanceText.RuntimeKey("selection_missing"),new Dictionary<string,object?>{{"name","版本甲"}}),"The selected version 版本甲 no longer exists. Select another version.");
        Equal(language.Text(MaintenanceText.RuntimeKey("available")),"Available");
        if(MaintenanceText.RuntimeKey("future-state")==MaintenanceText.RuntimeKey("available"))throw new Exception("Unknown runtime states must not imply availability.");
        Console.WriteLine($"Maintenance text passed: {count} metadata snapshot combinations preserve Chinese semantics, English formatting and state; errors and runtime names remain explicit.");
    }
    private static void Equal(string actual,string expected){if(actual!=expected)throw new Exception($"Expected {expected}, got {actual}.");}
}
