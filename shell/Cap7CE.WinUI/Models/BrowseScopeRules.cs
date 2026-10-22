namespace Cap7CE.WinUI.Models;

// Retrieval covers the directory tree without changing the user's browsing preference.
internal static class BrowseScopeRules
{
    public static string DirectoryScope(string query, bool includeSubfolders, bool hasFilters) =>
        !string.IsNullOrWhiteSpace(query) || hasFilters || includeSubfolders
            ? "directory-descendants" : "direct-children";
}
