using Cap7CE.WinUI.Localization;
using System.Net.Http;
using System.Text.Json;

namespace Cap7CE.WinUI.Services;

internal static class NativeUpdates
{
    // Explicit user check only. Never offer Electron installers as native updates.
    public static async Task<UiMessage> CheckAsync()
    {
        using var client=new HttpClient {Timeout=TimeSpan.FromSeconds(15)};client.DefaultRequestHeaders.UserAgent.ParseAdd("Cap7CE-WinUI/"+NativeVersion.Text);
        var text=await client.GetStringAsync("https://api.github.com/repos/7C93F3-L/Cap7CE/releases?per_page=10");
        using var json=JsonDocument.Parse(text);
        foreach(var release in json.RootElement.EnumerateArray()) {
            if(release.GetProperty("draft").GetBoolean()||release.GetProperty("prerelease").GetBoolean())continue;
            if(!release.GetProperty("assets").EnumerateArray().Any(a=>(a.GetProperty("name").GetString()??"").Contains("winui",StringComparison.OrdinalIgnoreCase)&&(a.GetProperty("name").GetString()??"").EndsWith(".zip",StringComparison.OrdinalIgnoreCase)))continue;
            var tag=release.GetProperty("tag_name").GetString()??"";
            return Version.TryParse(tag.TrimStart('v','V'),out var latest)&&Version.TryParse(NativeVersion.Text,out var current)&&latest<=current?UiMessage.Key("ui.update.current"):UiMessage.Key("ui.update.available",new Dictionary<string,object?>{{"version",tag}});
        }
        return UiMessage.Key("ui.update.noNativeRelease");
    }
}
