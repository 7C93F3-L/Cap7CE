using Cap7CE.WinUI.Localization;

internal static class LanguageChecks
{
    public static void Run()
    {
        var catalog=new LanguageCatalog(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Assets/languages.json")));
        LanguageBindingChecks.Run(catalog);
        FactLanguageChecks.Run(catalog);
        MaintenanceLanguageChecks.Run(catalog);
        ProgressLanguageChecks.Run(catalog);
        var session=new LanguageSession(catalog);var changes=0;session.Changed+=()=>changes++;
        Equal(session.Text("navigation.general"),"通用");
        session.Select("en-US","zh-CN");Equal(session.Text("navigation.general"),"General");
        Equal(session.Text("language.tag"),"en-US");
        Equal(session.Text("ui.keywords.remove",new Dictionary<string,object?>{{"word","通用 {count}"}}),"Remove keyword: 通用 {count}");
        Equal(session.Text("ui.details.items",new Dictionary<string,object?>{{"count",1200}}),"Items: 1,200");
        Equal(session.Text("native.progress.processed",new Dictionary<string,object?>{{"count",1234}}),"Processed 1,234 items");
        session.Select("en-US","zh-CN");if(changes!=1)throw new Exception("Unchanged language must not refresh controls.");
        session.Select("system","zh-Hant");Equal(session.Text("navigation.general"),"通用");
        session.Select("system","de-DE");Equal(session.Text("navigation.general"),"General");
        Reject<ArgumentOutOfRangeException>(()=>session.Select("invalid","en-US"));
        Reject<KeyNotFoundException>(()=>session.Text("missing.key"));
        Reject<ArgumentException>(()=>session.Text("native.progress.processed"));
        Reject<InvalidDataException>(()=>new LanguageCatalog("""{"key":{"zh-CN":"中文"}}"""));
        Reject<InvalidDataException>(()=>new LanguageCatalog("""{"key":{"zh-CN":"{count}","en-US":"{other}"}}"""));
        Reject<InvalidDataException>(()=>new LanguageCatalog("""{"key":{"zh-CN":"{count:N0}","en-US":"{count}"}}"""));
        Reject<InvalidDataException>(()=>new LanguageCatalog("""{"key":{"zh-CN":"中文","en-US":""}}"""));
        Console.WriteLine("Language checks passed: catalog parity, named parameters, culture, system resolution and change notifications.");
    }
    private static void Equal(string actual,string expected){if(actual!=expected)throw new Exception($"Expected {expected}, got {actual}.");}
    private static void Reject<T>(Action action)where T:Exception{try{action();}catch(T){return;}throw new Exception($"Expected {typeof(T).Name}");}
}
