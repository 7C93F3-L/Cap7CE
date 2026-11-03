using System.Runtime.InteropServices;
namespace Cap7CE.Core.FileOperations;
// Owns managed/native batch marshalling; Shell callbacks determine individual outcomes.
public static class WindowsTrashBatch
{
    [DllImport("Cap7CE.Core.FileOperations.Native.dll", CharSet = CharSet.Unicode, CallingConvention = CallingConvention.StdCall)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.AssemblyDirectory | DllImportSearchPath.System32)]
    private static extern int Cap7CE_RecycleItems([MarshalAs(UnmanagedType.LPArray, ArraySubType = UnmanagedType.LPWStr)] string[] paths,
        int count, [Out, MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 1)] int[] results);
    public static IReadOnlyList<WindowsFileOperationResult> Execute(IReadOnlyList<string> sources)
    {
        if (sources.Count is < 1 or > 200) throw new ArgumentException("trash-selection");
        var paths = sources.Select(WindowsFileOperationRules.Source).ToArray();
        return WindowsFileOperation.OnSta(() => {
            var results = new int[paths.Length];
            var status = Cap7CE_RecycleItems(paths, paths.Length, results);
            return (IReadOnlyList<WindowsFileOperationResult>)results.Select(code => {
                if (code == unchecked((int)0x8000000A)) code = status < 0 ? status : unchecked((int)0x80004005);
                return code == 0 ? new WindowsFileOperationResult("deleted") : new("failed", Error: code);
            }).ToArray();
        });
    }
}
