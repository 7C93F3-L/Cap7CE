using System.Text.Json;

namespace Cap7CE.Core.Host.MetadataBuild;

internal static class MetadataBuildStateSchema
{
    private static readonly JsonSerializerOptions FileJson = new() { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping, MaxDepth = 128 };
    internal static byte[] Encode(JsonElement value) => JsonSerializer.SerializeToUtf8Bytes(value, FileJson);
    internal static JsonElement Element(System.Text.Json.Nodes.JsonObject value) => JsonSerializer.SerializeToElement(value, FileJson);
    internal static bool Property(JsonElement value, string key, out JsonElement result)
    { result = default; return value.ValueKind == JsonValueKind.Object && value.TryGetProperty(key, out result); }
    internal static bool Text(JsonElement value, out string text) { text = value.ValueKind == JsonValueKind.String ? value.GetString()! : ""; return value.ValueKind == JsonValueKind.String; }
    internal static bool Hex(JsonElement value, int length) => Text(value, out var text) && text.Length == length && text.All(Uri.IsHexDigit);
    internal static bool Version(JsonElement value, int version) => Property(value, "version", out var field) && field.ValueKind == JsonValueKind.Number && field.TryGetDouble(out var number) && number == version;
    internal static bool Scope(JsonElement value) => Property(value, "volumeId", out var volume) && Hex(volume, 32)
        && Property(value, "rootFileReference", out var root) && (root.ValueKind == JsonValueKind.Null || Hex(root, 16));
    internal static bool Preferences(JsonElement value)
    {
        if (!Version(value, 2) || !Property(value, "intent", out var intent) || !Text(intent, out var state)
            || !Property(value, "consent", out var consent) || (state == "configured" ? consent.ValueKind != JsonValueKind.False
                : consent.ValueKind != JsonValueKind.True || state is not ("active" or "paused" or "completed"))
            || !Property(value, "policy", out var policy) || !Property(policy, "volumeOrder", out var order) || order.ValueKind != JsonValueKind.Array
            || order.GetArrayLength() is < 1 or > 64 || order.EnumerateArray().Any(item => !Hex(item, 32))
            || order.EnumerateArray().Select(item => item.GetString()).Distinct(StringComparer.Ordinal).Count() != order.GetArrayLength()
            || !Property(policy, "includes", out var includes) || includes.ValueKind != JsonValueKind.Array
            || !Property(policy, "excludes", out var excludes) || excludes.ValueKind != JsonValueKind.Array
            || includes.GetArrayLength() + excludes.GetArrayLength() > 256 || includes.EnumerateArray().Concat(excludes.EnumerateArray()).Any(item => !Scope(item))
            || !Property(value, "scopeLabels", out var labels) || labels.ValueKind != JsonValueKind.Object) return false;
        var entries = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var entry in labels.EnumerateObject()) entries[entry.Name] = entry.Value; // JSON.parse's last member wins.
        return entries.Count <= 256 && entries.All(entry => entry.Key.Length is 37 or 49 && entry.Key[32] == ':'
            && entry.Key[..32].All(Uri.IsHexDigit) && (entry.Key[33..] == "root" || entry.Key[33..].All(Uri.IsHexDigit))
            && Text(entry.Value, out var label) && label.Length <= 32768 && label.Length >= 3 && char.IsAsciiLetter(label[0]) && label[1] == ':' && label[2] is '\\' or '/');
    }
    internal static bool DirectoryQueue(JsonElement value)
    {
        if (!Version(value, 1) || !Property(value, "intent", out var intent) || !Text(intent, out var state) || state is not ("active" or "paused")
            || !Property(value, "jobs", out var jobs) || jobs.ValueKind != JsonValueKind.Array || jobs.GetArrayLength() > 32) return false;
        try { return jobs.EnumerateArray().All(job => Property(job, "path", out var path) && Text(path, out var text)
            && MetadataDirectoryPath.Normalize(text) == text && (!Property(job, "scope", out var scope) || Falsy(scope) || Scope(scope))); }
        catch (ArgumentException) { return false; }
    }
    private static bool Falsy(JsonElement value) => value.ValueKind is JsonValueKind.Null or JsonValueKind.False
        || value.ValueKind == JsonValueKind.String && value.GetString() == "" || value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) && number == 0;
}
