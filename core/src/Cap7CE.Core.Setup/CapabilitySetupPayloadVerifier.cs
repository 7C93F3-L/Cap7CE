using System.Security.Cryptography;

namespace Cap7CE.Core.Setup;

public sealed record CapabilityVerifiedPayload(
    string RootPath,
    CapabilityPayloadManifest Manifest,
    long TotalBytes);

public static class CapabilitySetupPayloadVerifier
{
    public static async ValueTask<long> VerifyInstalledAsync(
        string coreRoot,
        string readerRoot,
        CapabilityPayloadManifest manifest,
        CapabilitySetupManifest setupManifest,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(coreRoot);
        ArgumentException.ThrowIfNullOrWhiteSpace(readerRoot);
        ArgumentNullException.ThrowIfNull(manifest);
        ArgumentNullException.ThrowIfNull(setupManifest);
        manifest.Validate(setupManifest);

        var roots = new Dictionary<CapabilityPayloadComponent, string>
        {
            [CapabilityPayloadComponent.Core] = RequireRoot(coreRoot),
            [CapabilityPayloadComponent.Reader] = RequireRoot(readerRoot)
        };
        var actualFiles = roots.Values.SelectMany(EnumerateFilesWithoutReparsePoints)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var expectedFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        long totalBytes = 0;
        foreach (var payloadFile in manifest.Files)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var sourcePath = ResolveContainedPath(roots[payloadFile.Component], payloadFile.RelativePath);
            if (!expectedFiles.Add(sourcePath)) throw new InvalidDataException("payload-file-duplicate");
            if (!actualFiles.Contains(sourcePath)) throw new InvalidDataException("payload-file-missing");
            totalBytes = checked(totalBytes + await VerifyFileAsync(sourcePath, payloadFile, cancellationToken));
        }
        if (!actualFiles.SetEquals(expectedFiles)) throw new InvalidDataException("payload-unlisted-file");
        return totalBytes;
    }

    public static async ValueTask<CapabilityVerifiedPayload> VerifyAsync(
        string payloadRoot,
        CapabilityPayloadManifest manifest,
        CapabilitySetupManifest setupManifest,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(payloadRoot);
        ArgumentNullException.ThrowIfNull(manifest);
        ArgumentNullException.ThrowIfNull(setupManifest);
        manifest.Validate(setupManifest);

        var root = RequireRoot(payloadRoot);

        var actualFiles = EnumerateFilesWithoutReparsePoints(root);
        var expectedFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        long totalBytes = 0;
        foreach (var payloadFile in manifest.Files)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var relativeSource = $"{CapabilityPayloadManifest.ComponentDirectory(payloadFile.Component)}/{payloadFile.RelativePath}";
            var sourcePath = ResolveContainedPath(root, relativeSource);
            if (!expectedFiles.Add(sourcePath)) throw new InvalidDataException("payload-file-duplicate");
            if (!actualFiles.Contains(sourcePath)) throw new InvalidDataException("payload-file-missing");

            totalBytes = checked(totalBytes + await VerifyFileAsync(sourcePath, payloadFile, cancellationToken));
        }

        if (!actualFiles.SetEquals(expectedFiles)) throw new InvalidDataException("payload-unlisted-file");
        return new(root, manifest, totalBytes);
    }

    private static string RequireRoot(string root)
    {
        var fullPath = Path.GetFullPath(root);
        if (!Path.IsPathFullyQualified(fullPath) || !Directory.Exists(fullPath))
        {
            throw new InvalidDataException("payload-root-missing");
        }
        return fullPath;
    }

    private static async ValueTask<long> VerifyFileAsync(
        string sourcePath,
        CapabilityPayloadFile payloadFile,
        CancellationToken cancellationToken)
    {
        var fileInfo = new FileInfo(sourcePath);
        if ((fileInfo.Attributes & FileAttributes.ReparsePoint) != 0)
        {
            throw new InvalidDataException("payload-reparse-point");
        }
        if (fileInfo.Length != payloadFile.Length) throw new InvalidDataException("payload-file-length-mismatch");
        await using var stream = File.OpenRead(sourcePath);
        var digest = await SHA256.HashDataAsync(stream, cancellationToken);
        if (!Convert.ToHexString(digest).Equals(payloadFile.Sha256, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException("payload-file-hash-mismatch");
        }
        return fileInfo.Length;
    }

    private static HashSet<string> EnumerateFilesWithoutReparsePoints(string root)
    {
        var files = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var pending = new Stack<DirectoryInfo>();
        pending.Push(new(root));
        while (pending.TryPop(out var directory))
        {
            if ((directory.Attributes & FileAttributes.ReparsePoint) != 0)
            {
                throw new InvalidDataException("payload-reparse-point");
            }
            foreach (var entry in directory.EnumerateFileSystemInfos())
            {
                if ((entry.Attributes & FileAttributes.ReparsePoint) != 0)
                {
                    throw new InvalidDataException("payload-reparse-point");
                }
                if (entry is DirectoryInfo childDirectory) pending.Push(childDirectory);
                else if (entry is FileInfo file) files.Add(file.FullName);
                else throw new InvalidDataException("payload-entry-type");
            }
        }
        return files;
    }

    private static string ResolveContainedPath(string root, string relativePath)
    {
        var candidate = Path.GetFullPath(Path.Combine(root, relativePath.Replace('/', Path.DirectorySeparatorChar)));
        var prefix = root.EndsWith(Path.DirectorySeparatorChar) ? root : root + Path.DirectorySeparatorChar;
        if (!candidate.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException("payload-path-escape");
        }
        return candidate;
    }
}
