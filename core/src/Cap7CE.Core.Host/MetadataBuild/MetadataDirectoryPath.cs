namespace Cap7CE.Core.Host.MetadataBuild;

internal static class MetadataDirectoryPath
{
    internal static string Normalize(string value)
    {
        if (value.Length is < 3 or > 32768 || !char.IsAsciiLetter(value[0]) || value[1] != ':' || value[2] is not ('\\' or '/')
            || value.Skip(2).Any(character => character < 32 || "<>\"|?*:".Contains(character))) throw new ArgumentException("metadata-directory-invalid-path");
        var parts = new List<string>();
        foreach (var part in value[3..].Replace('/', '\\').Split('\\', StringSplitOptions.RemoveEmptyEntries))
        {
            if (part == ".") continue;
            if (part == "..") { if (parts.Count > 0) parts.RemoveAt(parts.Count - 1); }
            else parts.Add(part);
        }
        return value[..2] + "\\" + string.Join('\\', parts);
    }
}
