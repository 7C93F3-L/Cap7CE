using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace Cap7CE.Core.FileOperations;

public sealed record WindowsDirectoryIdentity(string Dev, string Ino, bool IsDirectory, bool IsLink, string RealPath);

// Reads metadata only, with the same Windows volume/index identity used by Node stat.
public static partial class WindowsDirectorySource
{
    public static unsafe WindowsDirectoryIdentity? Capture(string path)
    {
        using var handle = CreateFile(path, 0x80, 7, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero);
        if (handle.IsInvalid || GetInformation(handle, out var info) == 0) return null;
        var buffer = new char[32768]; string real;
        fixed (char* value = buffer)
        {
            var length = GetFinalPath(handle, value, (uint)buffer.Length, 0);
            if (length == 0 || length >= buffer.Length) return null; real = new string(value, 0, (int)length);
        }
        var link = false;
        if ((info.Attributes & 0x400) != 0)
        {
            if (GetTag(handle, 9, out var tag, 8) == 0) return null;
            link = tag.Tag is 0xa0000003 or 0xa000000c;
        }
        real = real.StartsWith("\\\\?\\UNC\\", StringComparison.Ordinal) ? "\\\\" + real[8..]
            : real.StartsWith("\\\\?\\", StringComparison.Ordinal) ? real[4..] : real;
        return new(info.Serial.ToString(System.Globalization.CultureInfo.InvariantCulture),
            (((ulong)info.IndexHigh << 32) | info.IndexLow).ToString(System.Globalization.CultureInfo.InvariantCulture),
            (info.Attributes & 0x10) != 0, link, real);
    }
    public static bool ExactName(string path) => Directory.EnumerateFileSystemEntries(Path.GetDirectoryName(path)!)
        .Any(value => Path.GetFileName(value) == Path.GetFileName(path));
    [StructLayout(LayoutKind.Sequential)] private struct Information
    {
        public uint Attributes, CreationLow, CreationHigh, AccessLow, AccessHigh, WriteLow, WriteHigh;
        public uint Serial, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [StructLayout(LayoutKind.Sequential)] private struct AttributeTag { public uint Attributes, Tag; }
    [LibraryImport("kernel32.dll", EntryPoint = "CreateFileW", StringMarshalling = StringMarshalling.Utf16)]
    private static partial SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
    [LibraryImport("kernel32.dll", EntryPoint = "GetFileInformationByHandle")]
    private static partial int GetInformation(SafeFileHandle handle, out Information info);
    [LibraryImport("kernel32.dll", EntryPoint = "GetFinalPathNameByHandleW")]
    private static unsafe partial uint GetFinalPath(SafeFileHandle handle, char* buffer, uint length, uint flags);
    [LibraryImport("kernel32.dll", EntryPoint = "GetFileInformationByHandleEx")]
    private static partial int GetTag(SafeFileHandle handle, int kind, out AttributeTag info, uint length);
}
