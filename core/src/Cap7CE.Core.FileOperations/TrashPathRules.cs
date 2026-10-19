using Cap7CE.Core.Configuration;

namespace Cap7CE.Core.FileOperations;

public static class TrashPathRules
{
    public static string Key(string value)
    {
        try { return FavoriteDirectoryRules.Key(Path.TrimEndingDirectorySeparator(Path.GetFullPath(value))); }
        catch (Exception error) when (error is ArgumentException or NotSupportedException) { return FavoriteDirectoryRules.Key(value); }
    }
    public static bool Within(string value, string root) => Key(value).StartsWith(Key(root).TrimEnd('\\') + "\\", StringComparison.Ordinal);
    public static bool Protected(string value, IReadOnlyList<string> cacheRoots)
    {
        try { _ = WindowsFileOperationRules.Source(value); }
        catch (ArgumentException) { return true; }
        return cacheRoots.Any(root => Key(value) == Key(root) || Within(value, root));
    }
    public static IReadOnlyList<TrashTarget> Targets(IReadOnlyList<TrashTarget> source, bool catalog)
    {
        if (!catalog) return source.ToArray();
        var order = new List<string>(); var values = new Dictionary<string, TrashTarget>(StringComparer.Ordinal);
        foreach (var item in source) { var key = Key(item.Path); if (!values.ContainsKey(key)) order.Add(key); values[key] = item; }
        return order.Select(key => values[key]).OrderBy(item => item.Path.Length).ToArray();
    }
}
