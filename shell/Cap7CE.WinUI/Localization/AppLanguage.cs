using System.Globalization;

namespace Cap7CE.WinUI.Localization;

internal static class AppLanguage
{
    public static LanguageSession Session {get;}=new(new LanguageCatalog(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Assets/languages.json"))));
    public static string Text(string key,IReadOnlyDictionary<string,object?>? parameters=null)=>Session.Text(key,parameters);
    public static void Apply(string preference)=>Session.Select(preference,CultureInfo.CurrentUICulture.Name);
}
