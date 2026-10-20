namespace Cap7CE.WinUI.Models;
internal sealed record WorkspaceCrumb(string Label,string Path);
internal static class WorkspacePathRules
{
    public static IReadOnlyList<WorkspaceCrumb> Crumbs(string path)
    {
        var result=new List<WorkspaceCrumb> {new("此电脑","")};if(string.IsNullOrWhiteSpace(path))return result;
        var full=Path.GetFullPath(path);var rawRoot=Path.GetPathRoot(full)!;var root=rawRoot.TrimEnd('\\')+"\\";
        result.Add(new(root.TrimEnd('\\'),root));var current=root;
        foreach(var part in full[rawRoot.Length..].Split('\\',StringSplitOptions.RemoveEmptyEntries)) {current=Path.Combine(current,part);result.Add(new(part,current));}
        return result;
    }
}
