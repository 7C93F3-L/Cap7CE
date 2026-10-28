using System.Globalization;
using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;

internal static class ProgressLanguageChecks
{
    public static void Run(LanguageCatalog catalog)
    {
        var language=new LanguageSession(catalog);var count=0;
        var previousCulture=CultureInfo.CurrentCulture;
        try {
            CultureInfo.CurrentCulture=CultureInfo.GetCultureInfo("zh-CN");
            foreach(var phase in new[]{"idle","preparing","discovering","waiting","extracting","pausing","paused","completed","failed","future-phase"})
            foreach(var operation in new[]{"status","cancelDirectories"})foreach(var total in new long?[]{null,0,12000})
            foreach(var error in new[]{null,"metadata-future-code"})foreach(var failed in new[]{0L,2L})foreach(var unsupported in new[]{0L,3L}) {
                var state=new MetadataTaskStatus(phase,1234,2345,failed,unsupported,total,null,error,true,operation);
                Equal(ProgressText.MetadataBusy(state,language),state.Text);
                Equal(ProgressText.MetadataFinished(state,language),state.Finished);count++;
                language.Select("en-US","zh-CN");
                NoChinese(ProgressText.MetadataBusy(state,language));NoChinese(ProgressText.MetadataFinished(state,language));
                language.Select("zh-CN","zh-CN");
            }
            foreach(var phase in new[]{"已取消","失败","完成","future-phase"})foreach(var error in new[]{"","raw-error"})
            foreach(var failed in new[]{0,2})foreach(var skipped in new[]{0,3})foreach(var total in new[]{0,1,12}) {
                var state=new AutoKeywordState(Phase:phase,Total:total,Processed:3,Succeeded:4,Failed:failed,Skipped:skipped,Message:error);
                Equal(ProgressText.AutoFinished(state,language),AutoKeywordNoticeText.Finished(state));
                foreach(var cancelling in new[]{false,true}) {
                    Equal(ProgressText.AutoBusy(state,cancelling,language),(cancelling?"正在取消…":"正在识别…")+(total>1?$" 3 / {total}":""));
                    language.Select("en-US","zh-CN");
                    NoChinese(ProgressText.AutoBusy(state,cancelling,language));NoChinese(ProgressText.AutoFinished(state,language));
                    language.Select("zh-CN","zh-CN");
                }
                count++;
            }
        } finally {CultureInfo.CurrentCulture=previousCulture;}

        var stage=UiMessage.Key(ProgressText.IndexStageKey("scanning"));
        var values=new Dictionary<string,object?>{{"stage",stage},{"drive","D:\\目录 {count}"},{"count",1234}};
        var notice=UiMessage.Key("ui.progress.indexDetails",values);
        values["drive"]="changed";values["count"]=99;
        Equal(notice.Render(language),"正在建立索引… D:\\目录 {count} · 已处理 1,234 项");
        var literal=UiMessage.Literal("ui.progress.indexScanning");
        var rawFailure=new MetadataTaskStatus("failed",0,0,0,0,null,null,"用户目录 {name}",true,"status");
        var deferred=UiMessage.Snapshot(session=>ProgressText.MetadataFinished(rawFailure,session));
        Equal(deferred.Render(language),"元数据提取失败：用户目录 {name}");
        language.Select("en-US","zh-CN");
        Equal(notice.Render(language),"Building the index… D:\\目录 {count} · Processed: 1,234");
        Equal(literal.Render(language),"ui.progress.indexScanning");
        Equal(deferred.Render(language),"Metadata extraction failed: 用户目录 {name}");
        foreach(var indexStage in new[]{"preparing","scanning","publishing","syncing",null,"future-stage"}) {
            NoChinese(language.Text(ProgressText.IndexStageKey(indexStage)));
        }
        Equal(ProgressText.IndexStageKey(null),"ui.progress.indexRunning");
        Equal(ProgressText.IndexStageKey("future-stage"),"ui.progress.indexRunning");
        Console.WriteLine($"Progress text passed: {count} snapshots preserve legacy Chinese semantics; English, deferred messages, copied parameters and raw data verified.");
    }
    private static void Equal(string actual,string expected){if(actual!=expected)throw new Exception($"Expected {expected}, got {actual}.");}
    private static void NoChinese(string text){if(text.Any(c=>c is >= '\u4e00' and <= '\u9fff'))throw new Exception($"Chinese progress copy leaked into English: {text}");}
}
