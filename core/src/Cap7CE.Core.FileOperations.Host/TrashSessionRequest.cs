using Cap7CE.Core.FileOperations;
using System.Text.Json;

namespace Cap7CE.Core.FileOperations.Host;

internal sealed record TrashSessionRequest(long RequestId, bool Catalog, IReadOnlyList<TrashTarget> Targets, IReadOnlyList<string> CacheRoots)
{
    public static TrashSessionRequest Read(JsonElement root)
    {
        RequireFields(root, ["version", "requestId", "mode", "targets", "cacheRoots"]);
        if (root.GetProperty("version").GetInt32() != 1) throw new InvalidDataException();
        var id = root.GetProperty("requestId").GetInt64();
        if (id is < 1 or > 9_007_199_254_740_991) throw new InvalidDataException();
        var catalog = root.GetProperty("mode").GetString() switch { "catalog" => true, "legacy" => false, _ => throw new InvalidDataException() };
        var targets = root.GetProperty("targets"); var roots = root.GetProperty("cacheRoots");
        if (targets.GetArrayLength() > 200 || roots.GetArrayLength() > 32 || !catalog && targets.GetArrayLength() != 1) throw new InvalidDataException();
        var selected = targets.EnumerateArray().Select(item => {
            RequireFields(item, ["path", "isDirectory"]);
            return new TrashTarget(ReadPath(item.GetProperty("path")), item.GetProperty("isDirectory").GetBoolean());
        }).ToArray();
        var caches = roots.EnumerateArray().Select(item => ReadPath(item)).ToArray();
        if (caches.Any(value => !Path.IsPathFullyQualified(value))) throw new InvalidDataException();
        return new(id, catalog, selected, caches);
    }
    private static string ReadPath(JsonElement element) => element.GetString() is { Length: > 0 and <= 32767 } value
        && !value.Contains('\0') ? value : throw new InvalidDataException();
    private static void RequireFields(JsonElement element, string[] fields)
    {
        var actual = element.EnumerateObject().Select(item => item.Name).ToArray();
        if (actual.Length != fields.Length || actual.Distinct(StringComparer.Ordinal).Count() != fields.Length
            || actual.Any(item => !fields.Contains(item, StringComparer.Ordinal))) throw new InvalidDataException();
    }
}
