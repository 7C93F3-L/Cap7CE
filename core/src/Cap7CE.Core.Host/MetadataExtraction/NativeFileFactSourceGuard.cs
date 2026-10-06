using System.Runtime.InteropServices;
using System.Text;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Win32.SafeHandles;

namespace Cap7CE.Core.Host.MetadataExtraction;

public sealed record NativeFileFactSource(CatalogEntryIdentity Identity, long SizeBytes, long ModifiedFileTime);

// Ordinary-account, read-attributes-only identity checks. Does not read content or grant read authorization.
public static class NativeFileFactSourceGuard
{
    private const uint ReadAttributes = 0x80;
    private const uint ShareReadWriteDelete = 7;
    private const uint OpenExisting = 3;
    private const uint OpenReparsePoint = 0x00200000;
    private const uint BackupSemantics = 0x02000000;
    private const uint BlockedAttributes = 0x00441410;

    public static bool Matches(FileFactResolvedSource source)
    {
        ArgumentNullException.ThrowIfNull(source);
        var native = Capture(source.FullPath);
        return native is not null && native.Identity == source.Identity
            && native.SizeBytes == source.Source.SizeBytes && native.ModifiedFileTime == source.Source.ModifiedFileTime;
    }

    public static NativeFileFactSource? Capture(string path) => CaptureCore(path, false);

    // Identity only for explicitly owned storage roots. A directory never becomes
    // an extraction source, and no ancestor reparse/offline/recall is accepted.
    public static CatalogEntryIdentity? CaptureDirectory(string path) => CaptureCore(path, true)?.Identity;

    private static NativeFileFactSource? CaptureCore(string path, bool directorySource)
    {
        if (!OperatingSystem.IsWindows()) return null;
        if (string.IsNullOrEmpty(path) || path.Length is < 4 or > 32760
            || !char.IsAsciiLetter(path[0]) || path[1] != ':' || path[2] != '\\'
            || path[3..].IndexOfAny(['\0', ':', '/', '?', '*', '<', '>', '|', '"']) >= 0
            || path[3..].Split('\\').Any(segment => segment.Length == 0 || segment is "." or "..")) return null;
        var root = char.ToUpperInvariant(path[0]) + ":\\";
        if (GetDriveTypeW(root) is not (2 or 3)) return null;
        if (directorySource && !HasOrdinaryDirectoryAncestors(path)) return null;
        using var handle = CreateFileW(@"\\?\" + path, ReadAttributes, ShareReadWriteDelete,
            IntPtr.Zero, OpenExisting, OpenReparsePoint | (directorySource ? BackupSemantics : 0), IntPtr.Zero);
        if (handle.IsInvalid || !GetFileInformationByHandle(handle, out var info)
            || (info.Attributes & (directorySource ? BlockedAttributes & ~0x10u : BlockedAttributes)) != 0
            || ((info.Attributes & 0x10) != 0) != directorySource) return null;
        using var directory = CreateFileW(root, 0, ShareReadWriteDelete,
            IntPtr.Zero, OpenExisting, BackupSemantics | OpenReparsePoint, IntPtr.Zero);
        if (directory.IsInvalid || !GetFileInformationByHandleEx(directory, 18, out var rootId,
            (uint)Marshal.SizeOf<FileIdInformation>()) || rootId.High != 0 || rootId.Low == 0) return null;
        // A parent junction can reach a different volume even when the final item is ordinary.
        if (!GetFileInformationByHandleEx(handle, 18, out var actualId, (uint)Marshal.SizeOf<FileIdInformation>())
            || actualId.Serial != rootId.Serial || actualId.High != 0
            || actualId.Low != (((ulong)info.IndexHigh << 32) | info.IndexLow)) return null;
        var system = new StringBuilder(32);
        if (!GetVolumeInformationW(root, IntPtr.Zero, 0, out var serial, out _, out _, system, 32)
            || !string.Equals(system.ToString(), "NTFS", StringComparison.OrdinalIgnoreCase)) return null;
        var first = ((ulong)serial << 32) | (rootId.Serial & uint.MaxValue);
        if (first == 0) first = 1;
        var size = ((ulong)info.SizeHigh << 32) | info.SizeLow;
        var modified = ((ulong)info.WriteHigh << 32) | info.WriteLow;
        if (size > long.MaxValue || modified > long.MaxValue) return null;
        return new(new($"{first:X16}{rootId.Low:X16}", $"{info.IndexHigh:X8}{info.IndexLow:X8}"), (long)size, (long)modified);
    }

    private static bool HasOrdinaryDirectoryAncestors(string path)
    {
        for (var separator = path.IndexOf('\\', 3); separator >= 0; separator = path.IndexOf('\\', separator + 1)) {
            using var ancestor = CreateFileW(@"\\?\" + path[..separator], ReadAttributes, ShareReadWriteDelete,
                IntPtr.Zero, OpenExisting, BackupSemantics | OpenReparsePoint, IntPtr.Zero);
            if (ancestor.IsInvalid || !GetFileInformationByHandle(ancestor, out var info)
                || (info.Attributes & 0x10) == 0 || (info.Attributes & (BlockedAttributes & ~0x10u)) != 0) return false;
        }
        return true;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BasicInformation
    {
        public uint Attributes, CreationLow, CreationHigh, AccessLow, AccessHigh, WriteLow, WriteHigh;
        public uint Serial, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct FileIdInformation { public ulong Serial, Low, High; }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetDriveTypeW(string root);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(string path, uint access, uint share, IntPtr security,
        uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out BasicInformation info);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int kind, out FileIdInformation info, uint size);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetVolumeInformationW(string root, IntPtr name, uint nameLength, out uint serial,
        out uint maximum, out uint flags, StringBuilder system, uint length);
}
