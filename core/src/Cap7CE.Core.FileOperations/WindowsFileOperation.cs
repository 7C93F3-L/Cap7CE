using System.Runtime.InteropServices;

namespace Cap7CE.Core.FileOperations;

public sealed record WindowsFileOperationResult(string Status, string? Path = null, int Error = 0);

public static partial class WindowsFileOperation
{
    [LibraryImport("Cap7CE.Core.FileOperations.Native.dll", EntryPoint = "Cap7CE_RenameDirectory", StringMarshalling = StringMarshalling.Utf16)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.AssemblyDirectory | DllImportSearchPath.System32)]
    private static unsafe partial int Rename(string source, string name, nuint owner, char* path, int capacity, out int outcome);
    [LibraryImport("Cap7CE.Core.FileOperations.Native.dll", EntryPoint = "Cap7CE_RecycleItem", StringMarshalling = StringMarshalling.Utf16)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.AssemblyDirectory | DllImportSearchPath.System32)]
    private static partial int Recycle(string source, out int aborted);
    public static WindowsFileOperationResult RenameDirectory(string source, string name, nuint owner) => OnSta(() => RenameCore(WindowsFileOperationRules.Source(source), WindowsFileOperationRules.Name(name), owner));
    private static unsafe WindowsFileOperationResult RenameCore(string source, string name, nuint owner)
    {
        var buffer = new char[32768];
        fixed (char* output = buffer)
        {
            var status = Rename(source, name, owner, output, buffer.Length, out var outcome);
            return status < 0 ? new("failed", Error: status) : outcome == 1 ? new("renamed", new string(output)) : new("cancelled");
        }
    }
    public static WindowsFileOperationResult RecycleItem(string source) => OnSta(() => {
        var status = Recycle(WindowsFileOperationRules.Source(source), out var aborted);
        return status >= 0 && aborted == 0 ? new("deleted") : new("failed", Error: status);
    });
    private static WindowsFileOperationResult OnSta(Func<WindowsFileOperationResult> action)
    {
        if (Thread.CurrentThread.GetApartmentState() == ApartmentState.STA) return action();
        WindowsFileOperationResult? result = null; Exception? failure = null;
        var thread = new Thread(() => { try { result = action(); } catch (Exception error) { failure = error; } });
        thread.SetApartmentState(ApartmentState.STA); thread.Start(); thread.Join();
        if (failure is not null) throw failure; return result!;
    }
}
