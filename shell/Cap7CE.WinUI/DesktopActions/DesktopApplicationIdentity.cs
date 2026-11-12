using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
namespace Cap7CE.WinUI.DesktopActions;
// Read-only identity matching also covers packaged windows hosted outside their executable.
internal static class DesktopApplicationIdentity
{
    public static bool Matches(nint window,Process process,DesktopProgram program)
    {
        if(!string.IsNullOrWhiteSpace(program.AppId)&&!Path.IsPathFullyQualified(program.AppId)){
            var identity=WindowId(window)??ProcessId(process);
            if(!string.IsNullOrEmpty(identity))return string.Equals(identity,program.AppId,StringComparison.OrdinalIgnoreCase);
        }
        return program.WindowPath.Length>0&&string.Equals(process.MainModule?.FileName,program.WindowPath,StringComparison.OrdinalIgnoreCase);
    }
    private static string? ProcessId(Process process)
    {
        var length=512u;var text=new StringBuilder((int)length);
        return GetApplicationUserModelId(process.Handle,ref length,text)==0?text.ToString():null;
    }
    private static string? WindowId(nint window)
    {
        var iid=typeof(IPropertyStore).GUID;
        if(SHGetPropertyStoreForWindow(window,ref iid,out var store)<0)return null;
        var key=new PropertyKey{Format=new("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),Id=5};var value=new PropVariant();
        try{return store.GetValue(ref key,out value)>=0&&value.Type==31?Marshal.PtrToStringUni(value.Pointer):null;}
        finally{PropVariantClear(ref value);DesktopShellApartment.Release(store);}
    }
    [StructLayout(LayoutKind.Sequential)] private struct PropertyKey{public Guid Format;public uint Id;}
    [StructLayout(LayoutKind.Explicit,Size=24)] private struct PropVariant{[FieldOffset(0)]public ushort Type;[FieldOffset(8)]public nint Pointer;}
    [ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore
    {
        [PreserveSig]int GetCount(out uint count);
        [PreserveSig]int GetAt(uint index,out PropertyKey key);
        [PreserveSig]int GetValue(ref PropertyKey key,out PropVariant value);
    }
    [DllImport("shell32.dll")] private static extern int SHGetPropertyStoreForWindow(nint window,ref Guid iid,out IPropertyStore store);
    [DllImport("ole32.dll")] private static extern int PropVariantClear(ref PropVariant value);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] private static extern int GetApplicationUserModelId(nint process,ref uint length,StringBuilder id);
}
