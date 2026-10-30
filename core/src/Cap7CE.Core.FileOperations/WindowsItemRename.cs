using System.Runtime.InteropServices;
using System.Text;

namespace Cap7CE.Core.FileOperations;

public sealed record RenamedItem(string Source,string Path);
public sealed record ItemRenameResult(bool Success,bool Cancelled,IReadOnlyList<RenamedItem> Changes,int Failed,int Error);
public static class WindowsItemRename
{
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate void Completion([MarshalAs(UnmanagedType.LPWStr)] string? source,[MarshalAs(UnmanagedType.LPWStr)] string? path,int error);
    [DllImport("Cap7CE.Core.FileOperations.Native.dll",CharSet=CharSet.Unicode,CallingConvention=CallingConvention.StdCall)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.AssemblyDirectory|DllImportSearchPath.System32)]
    private static extern int Cap7CE_RenameItems([MarshalAs(UnmanagedType.LPArray,ArraySubType=UnmanagedType.LPWStr)] string[] sources,
        int count,string name,nuint owner,Completion callback,out int aborted);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]
    private static extern uint GetLongPathName(string source,StringBuilder output,uint capacity);
    private static string Canonical(string path){var text=new StringBuilder(32768);var size=GetLongPathName(path,text,(uint)text.Capacity);return size>0&&size<text.Capacity?text.ToString():path;}
    public static ItemRenameResult Execute(IReadOnlyList<string> sources,string name,nuint owner)
    {
        if(sources.Count is <1 or >200)throw new ArgumentException("file-rename-selection");
        var paths=sources.Select(WindowsFileOperationRules.Source).ToArray();WindowsFileOperationRules.Name(name);
        if(paths.Distinct(StringComparer.OrdinalIgnoreCase).Count()!=paths.Length||paths.Any(parent=>paths.Any(child=>child.StartsWith(parent.TrimEnd('\\')+"\\",StringComparison.OrdinalIgnoreCase))))
            throw new ArgumentException("file-rename-selection");
        // Batch input is a common base name; preserve each file's original extension.
        if(paths.Length>1)foreach(var path in paths)WindowsFileOperationRules.Name(name+(Directory.Exists(path)?"":Path.GetExtension(path)));
        return WindowsFileOperation.OnSta(()=>{
            var changes=new List<RenamedItem>();var originals=paths.ToDictionary(Canonical,path=>path,StringComparer.OrdinalIgnoreCase);
            Completion completed=(source,path,error)=>{if(error>=0&&source is not null&&path is not null&&originals.TryGetValue(source,out var original))changes.Add(new(original,path));};
            var status=Cap7CE_RenameItems(paths,paths.Length,name,owner,completed,out var aborted);GC.KeepAlive(completed);
            return new ItemRenameResult(status>=0&&aborted==0&&changes.Count==paths.Length,aborted!=0,changes,Math.Max(0,paths.Length-changes.Count),status);
        });
    }
}
