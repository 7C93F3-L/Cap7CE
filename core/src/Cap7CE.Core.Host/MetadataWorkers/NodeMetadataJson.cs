using System.Text.Json;

namespace Cap7CE.Core.Host.MetadataWorkers;

internal static class NodeMetadataJson
{
    // All supported metadata numbers are integers representable exactly by both runtimes.
    public static void Validate(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Number) {
            if (!value.TryGetInt64(out var number) || number is < -9_007_199_254_740_991 or > 9_007_199_254_740_991) throw new JsonException();
        } else if (value.ValueKind == JsonValueKind.Object) {
            var keys = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in value.EnumerateObject()) {
                if (!keys.Add(property.Name)) throw new JsonException();
                Validate(property.Value);
            }
        } else if (value.ValueKind == JsonValueKind.Array) foreach (var item in value.EnumerateArray()) Validate(item);
    }
}
