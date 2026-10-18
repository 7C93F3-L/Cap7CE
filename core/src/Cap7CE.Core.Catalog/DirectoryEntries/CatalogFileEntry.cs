using System.Security.Cryptography;
using System.Text;

namespace Cap7CE.Core.Catalog.DirectoryEntries;

public sealed record CatalogFileName(string ParentFileReference, string Name);
public sealed record CatalogFileEntry(string EntryKey, string ParentFileReference, string Name, string Extension);
public sealed record CatalogFileEntrySource(long? CreatedUtcTicks, long? ModifiedUtcTicks, long? SizeBytes);
public sealed record CatalogFileEntrySet(CatalogEntryIdentity Identity, long? CreatedUtcTicks,
    IReadOnlyList<CatalogFileEntry> Entries);

internal static class CatalogFileEntryRules
{
    public const int MaximumEntries = 1024;
    public static CatalogFileEntry[] Normalize(CatalogEntryIdentity identity, IReadOnlyList<CatalogFileName> names)
    {
        CatalogV2Database.ValidateIdentity(identity);
        ArgumentNullException.ThrowIfNull(names);
        if (names.Count > MaximumEntries) throw new ArgumentException("File entry set is too large.");
        var entries = new List<CatalogFileEntry>(names.Count);
        foreach (var name in names) {
            if (name is null || string.IsNullOrEmpty(name.Name) || name.Name.Length > 1024
                || name.Name is "." or ".." || name.Name.IndexOfAny(['\0', '\\', '/', ':', '?', '*', '<', '>', '|', '"']) >= 0)
                throw new ArgumentException("File entry name is invalid.");
            CatalogV2Database.ValidateIdentity(new(identity.VolumeId, name.ParentFileReference));
            var parent = name.ParentFileReference.ToUpperInvariant();
            var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
                identity.FileReference.ToUpperInvariant() + "\0" + parent + "\0" + name.Name)));
            var extension = Path.GetExtension(name.Name);
            entries.Add(new(key, parent, name.Name, extension.Length <= 64 ? extension.ToLowerInvariant() : ""));
        }
        if (entries.Select(entry => entry.EntryKey).Distinct(StringComparer.Ordinal).Count() != entries.Count)
            throw new ArgumentException("File entry set contains duplicate names.");
        return entries.OrderBy(entry => entry.EntryKey, StringComparer.Ordinal).ToArray();
    }
}
