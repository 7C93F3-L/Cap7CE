using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;

internal static class FailureLanguageChecks
{
    public static void Run(LanguageCatalog catalog)
    {
        var language=new LanguageSession(catalog);var checks=0;
        foreach(var state in new[]{"needsRebuild","building","offline",null,"future-state"})foreach(var random in new[]{false,true}) {
            var message=UiMessage.Key(FailureText.ScopeKey(state,random));
            Equal(message.Render(language),BrowseScopeRules.IndexUnavailable(state,random));
            language.Select("en-US","zh-CN");NoChinese(message.Render(language));language.Select("zh-CN","zh-CN");checks++;
        }
        var inner=new InvalidOperationException("diagnostic details");
        var parameters=new Dictionary<string,object?>{{"path","D:\\用户 {count}"}};
        var failure=new UiFailure("ui.error.exclusionDirectory",parameters,inner);parameters["path"]="changed";
        if(failure is not IOException||failure.InnerException!=inner||failure.Message!="ui.error.exclusionDirectory")throw new Exception("Localized exceptions must retain category, diagnostic identity and cause.");
        Equal(FailureText.From(failure).Render(language),"排除项不是目录：D:\\用户 {count}");
        var missing=new UiDirectoryFailure("ui.error.directoryMissing");
        if(missing is not DirectoryNotFoundException)throw new Exception("Missing directories must retain their exception category.");
        Equal(FailureText.From(missing).Render(language),"目录不存在或当前不可用");
        var refresh=FailureText.Refresh(failure);
        language.Select("en-US","zh-CN");
        Equal(refresh.Render(language),"The exclusion is not a folder: D:\\用户 {count}; please refresh");
        Equal(FailureText.From(missing).Render(language),"The folder does not exist or is currently unavailable.");
        var stateFailure=new AutoKeywordState(Phase:"失败",DisplayMessage:FailureText.Keyword(failure));
        Equal(ProgressText.AutoFinished(stateFailure,language),"Recognition failed · The exclusion is not a folder: D:\\用户 {count}");
        var unknown=new CountingFailure();var snapshot=FailureText.From(unknown);var reads=unknown.Reads;
        for(var i=0;i<4;i++) {
            language.Select(i%2==0?"zh-CN":"en-US","zh-CN");Equal(snapshot.Render(language),"ui.error.coreNotConnected");
        }
        if(reads!=1||unknown.Reads!=reads)throw new Exception("Language updates must use the error snapshot, without rereading its owner.");
        Equal(FailureText.From(new IOException("通用 {count}")).Render(language),"通用 {count}");
        var provider=new IOException("provider-error");provider.Data["CoreMessage"]="用户诊断 ui.error.coreNotConnected";
        Equal(FailureText.From(provider).Render(language),"provider-error");
        provider.Data["CoreMessage"]="directory-browse-capacity-exceeded";NoChinese(FailureText.From(provider).Render(language));
        Equal(FailureText.From(new IOException("metadata-directory-changed")).Render(language),language.Text("ui.metadata.errorDirectoryChanged"));
        Equal(FailureText.From(new IOException("favorite-directories-order-changed")).Render(language),"The favorites list has changed. Cancel and reorder it again.");
        Equal(FailureText.Refresh(new IOException("invalid-cursor")).Render(language),"More results could not be loaded. Refresh to continue browsing.");
        Equal(FailureText.Keyword(new IOException("unknown English error")).Render(language),FailureText.Keyword(new IOException("未知中文错误")).Render(language));
        NoChinese(FailureText.Keyword(provider).Render(language));
        language.Select("zh-CN","zh-CN");
        Equal(ProgressText.AutoFinished(stateFailure,language),"识别失败 · 排除项不是目录：D:\\用户 {count}");
        Console.WriteLine($"Failure text passed: {checks} index scope combinations; exception categories/causes, deferred AI errors, copied parameters, raw data and protocol diagnostics.");
    }
    private sealed class CountingFailure : IOException
    {
        public int Reads {get;private set;}
        public override string Message {get{Reads++;return "ui.error.coreNotConnected";}}
    }
    private static void Equal(string actual,string expected){if(actual!=expected)throw new Exception($"Expected {expected}, got {actual}.");}
    private static void NoChinese(string text){if(text.Any(c=>c is >= '\u4e00' and <= '\u9fff'))throw new Exception($"Chinese authored error leaked into English: {text}");}
}
