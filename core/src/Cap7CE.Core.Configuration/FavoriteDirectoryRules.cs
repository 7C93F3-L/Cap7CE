namespace Cap7CE.Core.Configuration;

public static class FavoriteDirectoryRules
{
    public const int MaximumCount = 256, MaximumBytes = 1024 * 1024;
    private static FavoriteConfigurationException Invalid(string kind) => new($"favorite-directory-invalid-{kind}");
    public static bool IsId(string? value) => value is { Length: 36 } && Guid.TryParseExact(value, "D", out _);
    public static string PathValue(string? value)
    {
        if (value is null || value.Length is < 3 or > 32767 || !char.IsAsciiLetter(value[0])
            || value[1] != ':' || value[2] is not ('/' or '\\')
            || value[2..].Any(c => c < 32 || "<>:\"|?*".Contains(c))) throw Invalid("path");
        var parts = new List<string>();
        foreach (var part in value[3..].Replace('/', '\\').Split('\\', StringSplitOptions.RemoveEmptyEntries))
        {
            if (part == ".") continue;
            if (part == "..") { if (parts.Count > 0) parts.RemoveAt(parts.Count - 1); continue; }
            parts.Add(part);
        }
        return $"{char.ToUpperInvariant(value[0])}:\\" + string.Join('\\', parts);
    }
    public static string NameValue(string? value)
    {
        if (value is null || value.Length > 256 || value.Any(c => c < 32) || string.IsNullOrEmpty(Trim(value))) throw Invalid("name");
        return Trim(value);
    }
    // ECMAScript trim includes BOM and excludes the .NET-only NEL whitespace.
    private static string Trim(string value) => value.Trim(' ', '\t', '\n', '\v', '\f', '\r', '\u00a0', '\u1680',
        '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006', '\u2007', '\u2008', '\u2009', '\u200a',
        '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff');
    public static string DefaultName(string path) => path.Length == 3 ? path[..2] : path[(path.LastIndexOf('\\') + 1)..];
    public static string Key(string value) => FavoriteUnicodeKey.Create(value);
    public static string Relocate(string path, string oldPath, string newPath)
    {
        var source = oldPath.TrimEnd('\\'); var candidate = path.TrimEnd('\\');
        if (Key(candidate) == Key(source)) return newPath;
        return Key(candidate).StartsWith(Key(source) + "\\", StringComparison.Ordinal) ? newPath + candidate[source.Length..] : path;
    }
    public static void Validate(IReadOnlyList<FavoriteDirectory> items)
    {
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase); var paths = new HashSet<string>(StringComparer.Ordinal);
        if (items.Count > MaximumCount) throw new FavoriteConfigurationException("favorite-directories-invalid-state");
        foreach (var item in items)
            if (!IsId(item.Id) || item.Path != PathValue(item.Path) || item.Name != NameValue(item.Name)
                || !ids.Add(item.Id) || !paths.Add(Key(item.Path))) throw new FavoriteConfigurationException("favorite-directories-invalid-state");
    }
}
