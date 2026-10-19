using System.Text;
using System.Text.Json;
using System.Text.Encodings.Web;

namespace Cap7CE.Core.Configuration;

public static class FavoriteDirectoryJson
{
    public static IReadOnlyList<FavoriteDirectory> Read(ReadOnlySpan<byte> bytes)
    {
        if (bytes.StartsWith(new byte[] { 0xef, 0xbb, 0xbf })) bytes = bytes[3..];
        using var document = JsonDocument.Parse(new UTF8Encoding(false, true).GetString(bytes));
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object || root.EnumerateObject().Count() != 2
            || !root.TryGetProperty("version", out var version) || !version.TryGetInt32(out var number) || number != 1
            || !root.TryGetProperty("directories", out var array) || array.ValueKind != JsonValueKind.Array)
            throw new FavoriteConfigurationException("favorite-directories-invalid-state");
        var items = new List<FavoriteDirectory>();
        foreach (var item in array.EnumerateArray())
        {
            if (items.Count >= FavoriteDirectoryRules.MaximumCount || item.ValueKind != JsonValueKind.Object || item.EnumerateObject().Count() != 3)
                throw new FavoriteConfigurationException("favorite-directories-invalid-state");
            items.Add(new(item.GetProperty("id").GetString()!, item.GetProperty("path").GetString()!, item.GetProperty("name").GetString()!));
        }
        FavoriteDirectoryRules.Validate(items); return items;
    }
    public static byte[] Write(IReadOnlyList<FavoriteDirectory> items)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream, new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }))
        {
            writer.WriteStartObject(); writer.WriteNumber("version", 1); writer.WritePropertyName("directories"); WriteItems(writer, items); writer.WriteEndObject();
        }
        if (stream.Length > FavoriteDirectoryRules.MaximumBytes) throw new FavoriteConfigurationException("favorite-directories-state-too-large");
        return stream.ToArray();
    }
    public static void WriteItems(Utf8JsonWriter writer, IReadOnlyList<FavoriteDirectory> items)
    {
        writer.WriteStartArray();
        foreach (var item in items)
        {
            writer.WriteStartObject(); writer.WriteString("id", item.Id); writer.WriteString("path", item.Path); writer.WriteString("name", item.Name); writer.WriteEndObject();
        }
        writer.WriteEndArray();
    }
}
