using System.Text.Json;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Localization;

namespace Cap7CE.WinUI.Views;

internal static class SettingsReference
{
    private static readonly JsonElement data=Load();
    private static JsonElement Load()
    {
        using var document=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Assets","settings-reference.json")));
        return document.RootElement.Clone();
    }
    public static string Text(string key)=>AppLanguage.Text(key);
    public static string Shortcut(string key)=>data.GetProperty("shortcuts").GetProperty(key).GetString()??"";
    public static SettingsHelpGroup[] HelpGroups {get;}=JsonSerializer.Deserialize<SettingsHelpGroup[]>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Assets/settings-help.json")),new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
}
