using System.Text.Json;

namespace Cap7CE.WinUI.Views;

internal static class SettingsReference
{
    private static readonly JsonElement data=Load();
    private static JsonElement Load()
    {
        using var document=JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Assets","settings-reference.json")));
        return document.RootElement.Clone();
    }
    public static string Text(string key)=>data.GetProperty("text").TryGetProperty(key,out var value)?value.GetString()??key:key;
    public static string Shortcut(string key)=>data.GetProperty("shortcuts").GetProperty(key).GetString()??"";
    public static JsonElement CommandGroups=>data.GetProperty("commandGroups");
    public static JsonElement DangerousCommands=>data.GetProperty("dangerousCommands");
}
