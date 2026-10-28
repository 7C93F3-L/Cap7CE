using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
namespace Cap7CE.WinUI.Services;
internal static class FileAccessGuard
{
    public static AssetItem ResolveIdentity(AssetItem item,IReadOnlyList<Cap7CE.Core.Protocol.CoreVolumeStatus> volumes)
    {
        Validate(item);if(item.Entry.FileReference is not null)return item;
        using var handle=CreateFileW(item.FullPath,0x80,7,IntPtr.Zero,3,0x02000000,IntPtr.Zero);
        if(handle.IsInvalid||!GetFileInformationByHandle(handle,out var info))throw new UiFailure("ui.error.sourceIdentity");
        var root=Path.GetPathRoot(item.FullPath);
        var volume=volumes.FirstOrDefault(value=>string.Equals(value.DisplayName.TrimEnd('\\')+"\\",root,StringComparison.OrdinalIgnoreCase));
        if(volume is null)throw new UiFailure("ui.error.sourceIndex");
        return new(item.Entry with{VolumeId=volume.VolumeId,FileReference=(((ulong)info.IndexHigh<<32)|info.IndexLow).ToString("X16"),
            CreatedUtcTicks=((long)info.CreatedHigh<<32)|info.CreatedLow},item.FullPath);
    }
    public static void RejectLinks(string path)
    {
        path = Path.GetFullPath(path);
        if (path.Length < 3 || !char.IsAsciiLetter(path[0]) || path[1] != ':' || path[2] != '\\') throw new UiFailure("ui.error.localPath");
        for (string? part = path; part is not null; part = Path.GetDirectoryName(part.TrimEnd('\\')))
        {
            if ((File.GetAttributes(part) & FileAttributes.ReparsePoint) != 0) throw new UiFailure("ui.error.links");
            if (part == Path.GetPathRoot(part)) break;
        }
    }
    public static void Validate(AssetItem item)
    {
        RejectLinks(item.FullPath);
        if (item.Entry.FileReference is not { } expected) return;
        using var handle = CreateFileW(item.FullPath, 0x80, 7, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero);
        if (handle.IsInvalid || !GetFileInformationByHandle(handle, out var info)
            || (((ulong)info.IndexHigh << 32) | info.IndexLow).ToString("X16") != expected.ToUpperInvariant()) throw new UiFailure("ui.error.sourceRefresh");
        if (item.Entry.CreatedUtcTicks is { } created && (((long)info.CreatedHigh << 32) | info.CreatedLow) != created) throw new UiFailure("ui.error.sourceReplaced");
    }
    [StructLayout(LayoutKind.Sequential)] private struct FileInformation
    { public uint Attributes, CreatedLow, CreatedHigh, AccessLow, AccessHigh, WriteLow, WriteHigh, Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow; }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern SafeFileHandle CreateFileW(string path, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out FileInformation info);
}
