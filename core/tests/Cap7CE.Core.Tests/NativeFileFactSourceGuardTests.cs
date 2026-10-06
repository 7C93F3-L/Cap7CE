using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataExtraction;

namespace Cap7CE.Core.Tests;

internal static class NativeFileFactSourceGuardTests
{
    public static async Task RunAsync()
    {
        if (!OperatingSystem.IsWindows()) return;
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-native-source-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "中文 图像.png");
        var renamed = Path.Combine(root, "移动后.png");
        try
        {
            var bytes = new byte[] { 1, 2, 3, 4 };
            await File.WriteAllBytesAsync(path, bytes);
            var physical = NativeFileFactSourceGuard.Capture(path)
                ?? throw new InvalidOperationException("Windows NTFS fixture source must be readable.");
            var source = new FileFactResolvedSource(physical.Identity, Path.GetPathRoot(path)!, path[3..], path,
                new(physical.SizeBytes, physical.ModifiedFileTime, 0, 0));
            TestAssert.True(NativeFileFactSourceGuard.Matches(source), "Unicode local source native identity matches");
            TestAssert.True((await File.ReadAllBytesAsync(path)).SequenceEqual(bytes), "native guard never changes source content");
            TestAssert.False(NativeFileFactSourceGuard.Matches(source with { Identity = physical.Identity with { VolumeId = new('0', 32) } }),
                "wrong volume cannot pass source gate");
            TestAssert.False(NativeFileFactSourceGuard.Matches(source with { Identity = physical.Identity with { FileReference = new('0', 16) } }),
                "wrong file reference cannot pass source gate");
            TestAssert.False(NativeFileFactSourceGuard.Matches(source with { Source = source.Source with { ModifiedFileTime = source.Source.ModifiedFileTime + 1 } }),
                "one FILETIME tick mismatch cannot pass source gate");
            File.Move(path, renamed);
            TestAssert.True(NativeFileFactSourceGuard.Capture(path) is null, "old name cannot resolve a moved file");
            TestAssert.True(NativeFileFactSourceGuard.Matches(source with { FullPath = renamed, RelativePath = renamed[3..] }),
                "rename retains physical identity and source version");
            await File.WriteAllBytesAsync(renamed, [1, 2, 3, 4, 5]);
            TestAssert.False(NativeFileFactSourceGuard.Matches(source with { FullPath = renamed }), "content changes reject old source version");
            TestAssert.True(NativeFileFactSourceGuard.Capture(root) is null, "directory cannot become extraction source");
            var directoryIdentity = NativeFileFactSourceGuard.CaptureDirectory(root);
            TestAssert.True(directoryIdentity is not null && directoryIdentity.VolumeId == physical.Identity.VolumeId,
                "owned directory identity uses the same read-attributes volume boundary");
            TestAssert.True(NativeFileFactSourceGuard.CaptureDirectory(renamed) is null, "a file cannot become an owned storage root");
            TestAssert.True(NativeFileFactSourceGuard.CaptureDirectory(Path.GetPathRoot(root)!) is null,
                "a whole drive cannot become an owned storage exclusion");
            var replacement = Path.Combine(root, "replaceable"); Directory.CreateDirectory(replacement);
            var oldRoot = new FileFactOwnedStorageRoot(replacement, NativeFileFactSourceGuard.CaptureDirectory(replacement)!);
            FileFactOwnedStorage.Validate([oldRoot]);
            Directory.Move(replacement, Path.Combine(root, "retained-old-root")); Directory.CreateDirectory(replacement);
            await TestAssert.ThrowsAsync<InvalidOperationException>(() => Task.Run(() => FileFactOwnedStorage.Validate([oldRoot])),
                "recreated path cannot reuse an old subtree exclusion identity");
            var link = Path.Combine(root, "directory-link"); var child = Path.Combine(replacement, "child"); Directory.CreateDirectory(child);
            var linkCreated = false;
            try { Directory.CreateSymbolicLink(link, replacement); linkCreated = true; }
            catch (UnauthorizedAccessException) { /* Ordinary Windows accounts may not have symbolic-link permission. */ }
            catch (IOException) { /* Do not change system permissions to exercise this optional fixture. */ }
            if (linkCreated) {
                TestAssert.True(NativeFileFactSourceGuard.CaptureDirectory(link) is null, "owned root rejects a final reparse point");
                TestAssert.True(NativeFileFactSourceGuard.CaptureDirectory(Path.Combine(link, "child")) is null,
                    "ordinary final directory behind a reparse ancestor cannot become an owned exclusion");
            }
            foreach (var invalid in new[] { @"\\server\share\file.png", @"C:\a\..\b.png", @"C:\a.png:stream", "C:/a.png", @"C:\\a.png" })
                TestAssert.True(NativeFileFactSourceGuard.Capture(invalid) is null, "native source gate accepts only explicit local paths");
        }
        finally { Directory.Delete(root, true); }
    }
}
