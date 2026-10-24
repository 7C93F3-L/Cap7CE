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

    public static string IndexUnavailable(string? state,bool random)=>state switch {
        "needsRebuild"=>"该磁盘索引需要重新建立；请在设置的索引维护中选择该磁盘并点击“建立 / 更新”。"+(random?"索引就绪后才能随机浏览。":""),
        "building"=>"该磁盘索引正在建立；"+(random?"随机浏览":"搜索和筛选")+"需要等待索引就绪，当前仍可直接浏览。",
        _=>random?"随机浏览需要可查询的目录索引；请检查设置中的索引状态，当前仍可直接浏览。":"此目录的索引尚未就绪，可清除搜索和筛选后直接浏览；搜索及筛选需要可查询的索引"
    };
}
