using System.Runtime.InteropServices;
using System.Text;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Cap7CE.Core.Host.MetadataExtraction;

namespace Cap7CE.Core.Tests;

public sealed record NativeCatalogEntrySet(NativeFileFactSource Source, IReadOnlyList<CatalogFileName> Entries);

// Ordinary-account metadata only. Every returned name and parent is checked;
// failure, cancellation or a changed source never publishes a partial link set.
public static class NativeFileEntryReader
{
    private const int MaximumEntries = 1024, MaximumPathCharacters = 32768, MaximumTotalCharacters = 2 * 1024 * 1024;
    private static readonly IntPtr InvalidHandle = new(-1);

    public static NativeCatalogEntrySet? Read(string path, CancellationToken token = default)
    {
        token.ThrowIfCancellationRequested();
        var source = NativeFileFactSourceGuard.Capture(path);
        if (source is null) return null;
        var buffer = new StringBuilder(MaximumPathCharacters); var capacity = (uint)buffer.Capacity;
        var handle = FindFirstFileNameW(@"\\?\" + path, 0, ref capacity, buffer);
        if (handle == InvalidHandle) return null;
        try {
            var entries = new List<CatalogFileName>(); var seen = new HashSet<string>(StringComparer.Ordinal);
            var total = 0;
            while (true) {
                token.ThrowIfCancellationRequested();
                var relative = buffer.ToString();
                total = checked(total + relative.Length);
                if (entries.Count >= MaximumEntries || total > MaximumTotalCharacters
                    || relative.Length is < 2 or >= MaximumPathCharacters || relative[0] != '\\'
                    || relative[1] == '\\' || relative.IndexOfAny(['\0', ':', '/', '?', '*', '<', '>', '|', '"']) >= 0
                    || relative[1..].Split('\\').Any(segment => segment.Length == 0 || segment is "." or "..")) return null;
                var full = char.ToUpperInvariant(path[0]) + ":" + relative;
                var parent = NativeFileFactSourceGuard.CaptureDirectory(Path.GetDirectoryName(full)!);
                var actual = NativeFileFactSourceGuard.Capture(full);
                if (parent is null || parent.VolumeId != source.Identity.VolumeId || actual != source) return null;
                var name = Path.GetFileName(full);
                if (!seen.Add(parent.FileReference + "\0" + name)) return null;
                entries.Add(new(parent.FileReference, name));
                buffer.Clear(); capacity = (uint)buffer.Capacity;
                if (FindNextFileNameW(handle, ref capacity, buffer)) continue;
                if (Marshal.GetLastWin32Error() != 38) return null; // ERROR_HANDLE_EOF is the sole complete end.
                break;
            }
            token.ThrowIfCancellationRequested();
            return NativeFileFactSourceGuard.Capture(path) == source ? new(source, entries.AsReadOnly()) : null;
        } finally { FindClose(handle); }
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, ExactSpelling = true)]
    private static extern IntPtr FindFirstFileNameW(string fileName, uint flags, ref uint length, StringBuilder linkName);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool FindNextFileNameW(IntPtr handle, ref uint length, StringBuilder linkName);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool FindClose(IntPtr handle);
}
