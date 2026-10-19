namespace Cap7CE.Core.FileOperations;

public static class WindowsFileOperationRules
{
    public static string Source(string source)
    {
        if (string.IsNullOrEmpty(source) || source.Length > 32767 || source.IndexOf('\0') >= 0 || !Path.IsPathFullyQualified(source)
            || source.StartsWith("\\\\?\\", StringComparison.Ordinal) || source.StartsWith("\\\\.\\", StringComparison.Ordinal)) throw new ArgumentException("file-operation-invalid-path");
        var full = Path.GetFullPath(source);
        if (Path.GetPathRoot(full)?.TrimEnd('\\', '/') == full.TrimEnd('\\', '/')) throw new ArgumentException("file-operation-root-rejected");
        return full;
    }
    public static string Name(string name)
    {
        if (string.IsNullOrEmpty(name) || name.Length > 255 || name is "." or ".."
            || name.All(c => c is ' ' or '\u00a0' or '\u1680' or >= '\u2000' and <= '\u200a'
                or '\u2028' or '\u2029' or '\u202f' or '\u205f' or '\u3000' or '\ufeff')
            || name.Any(c => c < 32 || "<>:\"/\\|?*".Contains(c)) || name.EndsWith(' ') || name.EndsWith('.')) throw new ArgumentException("folder-rename-invalid-name");
        var stem = name.Split('.')[0].ToUpperInvariant();
        if (stem is "CON" or "PRN" or "AUX" or "NUL" || stem.Length == 4
            && (stem.StartsWith("COM", StringComparison.Ordinal) || stem.StartsWith("LPT", StringComparison.Ordinal)) && "123456789¹²³".Contains(stem[3])) throw new ArgumentException("folder-rename-invalid-name");
        return name;
    }
}
