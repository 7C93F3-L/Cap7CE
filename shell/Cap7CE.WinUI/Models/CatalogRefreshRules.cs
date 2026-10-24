namespace Cap7CE.WinUI.Models;

internal sealed record CatalogVolumeStamp(string Id,string Root,long? Revision,bool Queryable,string State);
internal static class CatalogRefreshRules
{
    // Null means a global/unknown change (also supports older Core responses).
    public static IReadOnlySet<string>? Changes(IReadOnlyList<CatalogVolumeStamp> before,IReadOnlyList<CatalogVolumeStamp> after,bool revisionChanged)
    {
        if(before.Concat(after).Any(v=>v.Revision is null))return null;
        var old=before.ToDictionary(v=>v.Id,StringComparer.Ordinal);
        var changed=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach(var item in after) {
            if(!old.Remove(item.Id,out var previous)||previous!=item) {
                changed.Add(item.Root);if(previous is not null)changed.Add(previous.Root);
            }
        }
        foreach(var item in old.Values)changed.Add(item.Root);
        return changed.Count==0&&revisionChanged?null:changed;
    }
    public static bool Affects(string path,IReadOnlySet<string>? roots)
    {
        if(roots is null)return true;if(path.Length==0)return roots.Count>0;
        var normalized=path.Replace('/','\\').TrimEnd('\\');
        return roots.Any(root=>normalized.Equals(root.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase)
            || normalized.StartsWith(root.TrimEnd('\\')+"\\",StringComparison.OrdinalIgnoreCase));
    }
    public static bool CanRefresh(bool invalidated,bool busy,int selected,bool previewOpen,bool minimized)
        =>invalidated&&!busy&&selected==0&&!previewOpen&&!minimized;
    public static T[] RetainSelection<T>(IEnumerable<T> selected,IEnumerable<T> next,Func<T,string> identity)
    {
        var keys=selected.Select(identity).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return next.Where(item=>keys.Contains(identity(item))).ToArray();
    }
}
