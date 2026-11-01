using System.Text.Json;

namespace Cap7CE.WinUI.Services;

// Runtime files belong to app; user-managed AI content stays beside it.
internal static class NativeContentPaths
{
    public static string Root(string applicationRoot)
    {
        var marker=Path.Combine(applicationRoot,"cap7ce-native.json");
        if(!File.Exists(marker))return applicationRoot;
        using var document=JsonDocument.Parse(File.ReadAllText(marker));
        return document.RootElement.TryGetProperty("layout",out var layout)&&layout.GetString()=="installed-app"
            ?Directory.GetParent(Path.TrimEndingDirectorySeparator(Path.GetFullPath(applicationRoot)))!.FullName:applicationRoot;
    }
}
