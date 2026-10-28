using Cap7CE.WinUI.Localization;
using Microsoft.UI.Xaml;

internal static class LanguageBindingChecks
{
    public static void Run(LanguageCatalog catalog)
    {
        var session=new LanguageSession(catalog);var element=new FrameworkElement();var property=new DependencyProperty();
        LanguageBinding.Attach(element,property,session,"navigation.general");Equal(element.GetValue(property),"通用");
        session.Select("en-US","zh-CN");Equal(element.GetValue(property),"通用"); // Detached controls refresh on reload.
        element.Load();Equal(element.GetValue(property),"General");
        session.Select("zh-CN","zh-CN");Equal(element.GetValue(property),"通用");
        LanguageBinding.Attach(element,property,session,"navigation.about");
        session.Select("en-US","zh-CN");Equal(element.GetValue(property),"About");
        element.Unload();session.Select("zh-CN","zh-CN");Equal(element.GetValue(property),"About");
        element.Load();Equal(element.GetValue(property),"关于");
        // Native window-content reparenting may report an old unload after reload.
        element.NotifyUnloaded();element.DispatcherQueue.Drain();
        session.Select("en-US","zh-CN");Equal(element.GetValue(property),"About");
        element.Unload(notifyBeforeStateChange:true);element.DispatcherQueue.Drain();
        session.Select("zh-CN","zh-CN");Equal(element.GetValue(property),"About");
        element.Load();Equal(element.GetValue(property),"关于");
        element.Unload(notifyBeforeStateChange:true);element.Load();element.DispatcherQueue.Drain();
        session.Select("en-US","zh-CN");Equal(element.GetValue(property),"About");
        LanguageBinding.Clear(element,property);element.SetValue(property,"通用.txt");
        session.Select("en-US","zh-CN");Equal(element.GetValue(property),"通用.txt");
        element.Unload();element.Load();Equal(element.GetValue(property),"通用.txt");

        var count=2;var applications=0;string? formatted=null;
        LanguageBinding.Attach(element,property,session,"native.progress.processed",()=>new Dictionary<string,object?>{{"count",count}},text=>{formatted=text;applications++;});
        Equal(formatted,"Processed 2 items");count=7;
        session.Select("zh-CN","zh-CN");Equal(formatted,"已处理 7 项");
        if(applications!=2)throw new Exception("Custom rendering must run once per language update.");

        element.DispatcherQueue.HasThreadAccess=false;
        session.Select("en-US","zh-CN");LanguageBinding.Clear(element,property);element.SetValue(property,"用户文件");
        element.DispatcherQueue.Drain();Equal(element.GetValue(property),"用户文件");
        if(applications!=2)throw new Exception("A queued update must not revive a replaced binding.");
        Console.WriteLine("Language binding owner passed: initial/load/unload, late native unload after reparent/reload, replacement, literal data, current parameters, custom rendering and stale dispatcher suppression (fixture surface).");
    }
    private static void Equal(object? actual,string expected){if(!Equals(actual,expected))throw new Exception($"Expected {expected}, got {actual}.");}
}
