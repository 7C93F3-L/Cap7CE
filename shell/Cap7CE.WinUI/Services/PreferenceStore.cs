using System.Text.Json;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;
internal sealed class PreferenceStore
{
    public static string DataRoot => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Cap7CE-PhaseF");
    public static string ProductData => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Cap7CE", "UserData");
    private readonly string path = Path.Combine(DataRoot, "shell-preferences.json");
    private readonly SemaphoreSlim gate = new(1);
    public ShellPreferences Current { get; private set; } = new();
    public event Action? Changed;
    public async Task LoadAsync()
    {
        if (File.Exists(path)) Current = JsonSerializer.Deserialize<ShellPreferences>(await File.ReadAllTextAsync(path), FramedRpc.Json) ?? new();
        else
        {
            var original = Path.Combine(ProductData, "config/preferences.json");
            if (File.Exists(original))
            {
                using var json = JsonDocument.Parse(await File.ReadAllTextAsync(original)); var value = json.RootElement;
                if (value.TryGetProperty("themePreference", out var theme)) Current = Current with { Theme = theme.GetString() ?? "system" };
                if (value.TryGetProperty("appearanceColors", out var colors))
                    Current = Current with { Color1 = colors.GetProperty("themeColor").GetString()!, Color2 = colors.GetProperty("accentColor").GetString()! };
            }
        }
        if (Current.Material is not ("mica" or "mica-alt") || Current.Theme is not ("system" or "light" or "dark")
            || Current.TileSize is < 96 or > 280 || Current.FontSize is < 10 or > 24) Current = new();
    }
    public async Task SaveAsync(ShellPreferences value)
    {
        await gate.WaitAsync();
        var temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            Directory.CreateDirectory(DataRoot);
            await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(value, FramedRpc.Json));
            File.Move(temporary, path, true); Current = value; Changed?.Invoke();
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); gate.Release(); }
    }
}
