using System.Text.Json;

namespace Cap7CE.WinUI.Services;
[Microsoft.UI.Xaml.Data.Bindable]
public sealed class Favorite(string id, string path, string name)
{
    public string Id { get; } = id;
    public string Path { get; } = path;
    public string Name { get; } = name;
    public override string ToString() => Name;
}
internal sealed class FavoriteService(string root)
{
    private readonly SemaphoreSlim gate = new(1);
    public IReadOnlyList<Favorite> Items { get; private set; } = [];
    public event Action? Changed;
    public async Task ExecuteAsync(string operation = "list", string? id = null, string? path = null, string? name = null, string? direction = null)
    {
        await gate.WaitAsync();
        try
        {
            var reply = await NativeCoreRequest.SendAsync(Path.Combine(root, "core/artifacts/configuration-host/Cap7CE.Core.Configuration.Host.exe"),
                ["--favorites-file", Path.Combine(PreferenceStore.ProductData, "config/directories.json")], new { version = 1, operation, id, path, name, direction });
            if (!reply.GetProperty("ok").GetBoolean()) throw new IOException(reply.GetProperty("error").GetString());
            Items = reply.GetProperty("directories").Deserialize<Favorite[]>(FramedRpc.Json) ?? [];
            Changed?.Invoke();
        }
        finally { gate.Release(); }
    }
}
