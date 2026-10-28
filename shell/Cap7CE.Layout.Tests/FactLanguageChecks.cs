using System.Text.Json;
using Cap7CE.WinUI.Localization;

internal static class FactLanguageChecks
{
    public static void Run(LanguageCatalog catalog)
    {
        var count=0;
        void Check(string key){foreach(var language in LanguageCatalog.Languages)if(string.IsNullOrWhiteSpace(catalog.Text(key,language)))throw new Exception(key);count++;}
        JsonDocument Read(string file)=>JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Assets",file)));
        using var advanced=Read("filter-advanced-options.json");
        foreach(var group in advanced.RootElement.EnumerateArray()) {
            var id=group.GetProperty("id").GetString()!;Check(FactTextKeys.Group(id));
            foreach(var option in group.GetProperty("options").EnumerateArray())Check(FactTextKeys.Option(id,option.GetProperty("id").GetString()!));
        }
        using var media=Read("filter-media-options.json");
        foreach(var group in media.RootElement.EnumerateArray()) {
            var id=group.GetProperty("id").GetString()!;var split=id.LastIndexOf('-');
            foreach(var option in group.GetProperty("options").EnumerateArray())Check(FactTextKeys.Media(id[..split],id[(split+1)..],option.GetProperty("id").GetString()!));
        }
        using var types=Read("filter-three-d-types.json");foreach(var type in types.RootElement.EnumerateArray())Check(FactTextKeys.Type(type.GetProperty("id").GetString()!));
        using var colors=Read("filter-visual-semantics.json");foreach(var color in colors.RootElement.EnumerateArray())Check(FactTextKeys.Color(color.GetProperty("id").GetString()!));
        if(count<100)throw new Exception("Generated preset coverage was unexpectedly reduced.");
        Console.WriteLine($"Generated filter language keys resolved in both languages: {count} preset/group identities.");
    }
}
