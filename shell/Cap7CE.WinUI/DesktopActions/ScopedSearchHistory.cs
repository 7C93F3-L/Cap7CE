namespace Cap7CE.WinUI.DesktopActions;
// Pure projection of the one history store; selecting a term never restores another location.
internal static class ScopedSearchHistory
{
    public static string[] Select(DesktopActionOptions options,string path,bool favorite,string entryPath,string text)
        =>Groups(options,path,favorite,entryPath,text).Select(group=>group[0].Query).ToArray();
    public static DesktopSearch[][] Groups(DesktopActionOptions options,string path,bool favorite,string entryPath,string text)
    {
        if(!options.RecordHistory)return [];
        static bool Same(string a,string b)=>string.Equals(a.TrimEnd('\\','/'),b.TrimEnd('\\','/'),StringComparison.OrdinalIgnoreCase);
        return options.History.Where(item=>item.Favorite==favorite&&Same(item.Path,path)&&(!favorite||Same(item.EntryPath,entryPath)))
            .Where(item=>item.Query.Contains(text.Trim(),StringComparison.OrdinalIgnoreCase))
            .GroupBy(item=>item.Query,StringComparer.OrdinalIgnoreCase).Take(options.HistoryCount).Select(group=>group.ToArray()).ToArray();
    }
}
