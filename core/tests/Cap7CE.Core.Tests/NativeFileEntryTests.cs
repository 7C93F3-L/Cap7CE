using System.Runtime.InteropServices;
using System.Security.Cryptography;
using Cap7CE.Core.Host.MetadataExtraction;

namespace Cap7CE.Core.Tests;

internal static class NativeFileEntryTests
{
    public static async Task RunAsync()
    {
        if (!OperatingSystem.IsWindows()) return;
        // Some redirected TEMP directories reject FindFirstFileNameW with ERROR_NOT_SUPPORTED.
        var root = Path.Combine(AppContext.BaseDirectory, "Cap7CE-entry-native-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try {
            var first = Path.Combine(root, "first"); var second = Path.Combine(root, "第二个目录");
            Directory.CreateDirectory(first); Directory.CreateDirectory(second);
            var source = Path.Combine(first, "original.txt"); var alias = Path.Combine(second, "另一个名字.txt");
            await File.WriteAllTextAsync(source, "private synthetic hard-link fixture");
            var hash = SHA256.HashData(await File.ReadAllBytesAsync(source));
            var single = NativeFileEntryReader.Read(source);
            TestAssert.True(single is not null && single.Entries.Count == 1, "single-link metadata enumeration is complete");
            TestAssert.True(CreateHardLinkW(alias, source, IntPtr.Zero), "create private same-volume synthetic link");
            var linked = NativeFileEntryReader.Read(source)!;
            TestAssert.Equal(2, linked.Entries.Count, "ordinary Core enumerates both names, without elevated Reader");
            var alternate = NativeFileEntryReader.Read(alias)!;
            TestAssert.Equal(linked.Source, alternate.Source, "either name resolves the same physical file");
            TestAssert.True(linked.Entries.OrderBy(item => item.Name).SequenceEqual(alternate.Entries.OrderBy(item => item.Name)), "entry set does not depend on the starting path");
            TestAssert.Equal(2, linked.Entries.Select(item => item.ParentFileReference).Distinct().Count(), "parents are represented by stable identities");
            File.Delete(alias);
            var remaining = NativeFileEntryReader.Read(source)!;
            TestAssert.Equal(1, remaining.Entries.Count, "removing one link preserves remaining physical file");
            TestAssert.Equal(linked.Source.Identity, remaining.Source.Identity, "link removal preserves physical identity");
            TestAssert.Equal(linked.Source.ModifiedFileTime, remaining.Source.ModifiedFileTime, "link removal does not manufacture a content change");
            TestAssert.True(hash.SequenceEqual(SHA256.HashData(await File.ReadAllBytesAsync(source))), "metadata discovery does not change source bytes");
            using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
            await TestAssert.ThrowsAsync<OperationCanceledException>(() => Task.Run(() => NativeFileEntryReader.Read(source, cancellation.Token)), "cancelled discovery never yields a partial result");
            TestAssert.True(NativeFileEntryReader.Read(first) is null, "directories are not interpreted as hard-linked files");
            TestAssert.True(NativeFileEntryReader.Read(Path.Combine(root, "missing")) is null, "inaccessible source remains unknown, not an empty complete set");
        } finally { Directory.Delete(root, recursive: true); }
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreateHardLinkW(string newName, string existingName, IntPtr security);
}
