namespace Cap7CE.WinUI.Models;

internal sealed record CatalogVolumeStamp(string Id,string Root,long? Revision,bool Queryable,string State);
internal sealed record CatalogPathChange(string Root,IReadOnlyList<string>? RelativePaths);
internal sealed record CatalogRefreshImpact(IReadOnlySet<string>? Roots,IReadOnlyList<CatalogPathChange>? Paths=null);
internal static class CatalogRefreshRules
{
    public static bool AffectsChange(string path,CatalogRefreshImpact impact)
    {
        if(impact.Paths is null)return Affects(path,impact.Roots);
        if(path.Length==0)return impact.Paths.Count>0;
        var normalized=path.Replace('/','\\').TrimEnd('\\');
        foreach(var scope in impact.Paths) {
            var root=scope.Root.Replace('/','\\').TrimEnd('\\');
            if(!normalized.Equals(root,StringComparison.OrdinalIgnoreCase)&&!normalized.StartsWith(root+"\\",StringComparison.OrdinalIgnoreCase))continue;
            if(scope.RelativePaths is null)return true;
            foreach(var relative in scope.RelativePaths) {
                var value=relative.Replace('/','\\');
                if(value.StartsWith('\\')||value.Contains(':')||value.Split('\\').Any(part=>part is "." or ".."))return true;
                var changed=value.Length==0?root:root+"\\"+value.TrimEnd('\\');
                if(normalized.Equals(changed,StringComparison.OrdinalIgnoreCase)||changed.StartsWith(normalized+"\\",StringComparison.OrdinalIgnoreCase)
                    ||normalized.StartsWith(changed+"\\",StringComparison.OrdinalIgnoreCase))return true;
            }
        }
        return false;
    }
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
