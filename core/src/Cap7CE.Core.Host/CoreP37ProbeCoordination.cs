using System.Text.Json;

namespace Cap7CE.Core.Host;

internal sealed class CoreP37ProbeCoordination
{
    private const string EnvironmentName = "CAP7CE_P37_PROBE_ROOT";
    private readonly string root;

    private CoreP37ProbeCoordination(string root) => this.root = root;

    public string CatalogRoot => Path.Combine(root, "client-catalog");
    public string Token => Path.GetFileName(root)[4..];

    public static CoreP37ProbeCoordination Open()
    {
        var value = Environment.GetEnvironmentVariable(EnvironmentName);
        if (string.IsNullOrWhiteSpace(value)) throw new InvalidDataException("p37-probe-root-missing");
        var full = Path.GetFullPath(value);
        var directory = new DirectoryInfo(full);
        if (!directory.Exists || directory.Attributes.HasFlag(FileAttributes.ReparsePoint)
            || directory.Name.Length != 36 || !directory.Name.StartsWith("run-", StringComparison.Ordinal)
            || !directory.Name[4..].All(character => char.IsAsciiHexDigit(character))
            || directory.Parent?.Name != "probe" || directory.Parent.Parent?.Name != "reader-p37"
            || directory.Parent.Parent.Parent?.Name != "artifacts")
        {
            throw new InvalidDataException("p37-probe-root-invalid");
        }
        return new CoreP37ProbeCoordination(directory.FullName);
    }

    public void WriteState(string phase)
    {
        var pending = Path.Combine(root, "client-state.pending.json");
        File.WriteAllText(pending, JsonSerializer.Serialize(new { phase }));
        File.Move(pending, Path.Combine(root, "client-state.json"), true);
    }

    public async Task WaitForAdminAsync(string expected, CancellationToken token)
    {
        var path = Path.Combine(root, "admin-state.json");
        while (true)
        {
            token.ThrowIfCancellationRequested();
            try
            {
                var bytes = await File.ReadAllBytesAsync(path, token);
                if (bytes.Length is > 0 and <= 256)
                {
                    using var document = JsonDocument.Parse(bytes);
                    if (document.RootElement.TryGetProperty("phase", out var phase)
                        && phase.GetString() == expected) return;
                }
            }
            catch (IOException) { }
            catch (JsonException) { }
            await Task.Delay(100, token);
        }
    }

    public bool DeleteCatalogRoot()
    {
        var expected = Path.GetFullPath(Path.Combine(root, "client-catalog"));
        if (!Directory.Exists(expected)) return true;
        var directory = new DirectoryInfo(expected);
        if (!string.Equals(directory.Parent?.FullName, root, StringComparison.OrdinalIgnoreCase)
            || directory.Name != "client-catalog"
            || directory.Attributes.HasFlag(FileAttributes.ReparsePoint)) return false;
        Directory.Delete(expected, recursive: true);
        return !Directory.Exists(expected);
    }
}
