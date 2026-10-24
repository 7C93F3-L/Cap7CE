namespace Cap7CE.WinUI.Models;

// Retrieval covers the directory tree without changing the user's browsing preference.
internal static class BrowseScopeRules
{
    public static bool UsesCatalogResults(bool filesystem,string path,string query,bool hasFilters,bool random) =>
        !filesystem && (path.Length > 0 || !string.IsNullOrWhiteSpace(query) || hasFilters || random);

    public static string DirectoryScope(string query, bool includeSubfolders, bool hasFilters) =>
        !string.IsNullOrWhiteSpace(query) || hasFilters || includeSubfolders
            ? "directory-descendants" : "direct-children";

    public static string EntryType(string query, bool includeSubfolders, bool hasFilters) =>
        !string.IsNullOrWhiteSpace(query) || hasFilters || includeSubfolders ? "file" : "any";
}
