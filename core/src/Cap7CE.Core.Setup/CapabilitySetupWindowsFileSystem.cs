namespace Cap7CE.Core.Setup;

internal static class CapabilitySetupWindowsFileSystem
{
    public static async ValueTask CopyFileAsync(
        string source,
        string destination,
        CancellationToken cancellationToken)
    {
        await using var input = new FileStream(
            source, FileMode.Open, FileAccess.Read, FileShare.Read, 65_536,
            FileOptions.Asynchronous | FileOptions.SequentialScan);
        await using var output = new FileStream(
            destination, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65_536,
            FileOptions.Asynchronous | FileOptions.SequentialScan);
        await input.CopyToAsync(output, cancellationToken);
        await output.FlushAsync(cancellationToken);
    }

    public static void CopyOwnedTree(string source, string destination)
    {
        RequireNoReparseAncestors(source);
        if (Directory.Exists(destination) || File.Exists(destination))
        {
            throw new IOException("destination-already-exists");
        }
        Directory.CreateDirectory(destination);
        var pending = new Stack<(string Source, string Destination)>();
        pending.Push((source, destination));
        while (pending.TryPop(out var pair))
        {
            foreach (var entry in new DirectoryInfo(pair.Source).EnumerateFileSystemInfos())
            {
                if ((entry.Attributes & FileAttributes.ReparsePoint) != 0)
                {
                    throw new InvalidDataException("setup-reparse-point");
                }
                var target = Path.Combine(pair.Destination, entry.Name);
                if (entry is DirectoryInfo directory)
                {
                    Directory.CreateDirectory(target);
                    pending.Push((directory.FullName, target));
                }
                else if (entry is FileInfo file)
                {
                    file.CopyTo(target, overwrite: false);
                }
                else throw new InvalidDataException("setup-entry-type");
            }
        }
    }

    public static void MoveToBackup(string source, string backup)
    {
        if (!Directory.Exists(source)) return;
        RequireNoReparseAncestors(source);
        if (Directory.Exists(backup) || File.Exists(backup)) throw new IOException("backup-already-exists");
        Directory.Move(source, backup);
    }

    public static void RestoreDirectory(string destination, string backup, bool existed)
    {
        if (Directory.Exists(destination)) DeleteOwnedTree(destination);
        if (Directory.Exists(backup))
        {
            RequireNoReparseAncestors(backup);
            Directory.Move(backup, destination);
        }
        else if (existed) throw new DirectoryNotFoundException("setup-backup-missing");
    }

    public static byte[]? ReadOwnedFile(string path, int maximumBytes)
    {
        if (!File.Exists(path)) return null;
        var info = new FileInfo(path);
        if ((info.Attributes & FileAttributes.ReparsePoint) != 0 || info.Length > maximumBytes)
        {
            throw new InvalidDataException("setup-state-file-invalid");
        }
        return File.ReadAllBytes(path);
    }

    public static async ValueTask WriteOwnedFileAsync(
        string destination,
        string pending,
        byte[] contents,
        CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
        RequireRegularFileOrMissing(destination);
        await WriteNewFileAsync(pending, contents, cancellationToken);
        File.Move(pending, destination, overwrite: true);
    }

    public static async ValueTask RestoreFileAsync(
        string destination,
        byte[]? contents,
        CancellationToken cancellationToken)
    {
        if (contents is null)
        {
            DeleteOwnedFile(destination);
            return;
        }
        var pending = destination + ".rollback.pending";
        RequireRegularFileOrMissing(destination);
        DeleteOwnedFile(pending);
        await WriteNewFileAsync(pending, contents, cancellationToken);
        File.Move(pending, destination, overwrite: true);
    }

    public static void DeleteOwnedFile(string path)
    {
        if (!File.Exists(path)) return;
        var info = new FileInfo(path);
        if ((info.Attributes & FileAttributes.ReparsePoint) != 0)
        {
            throw new InvalidDataException("setup-reparse-point");
        }
        info.Delete();
    }

    public static void DeleteOwnedTree(string path)
    {
        if (!Directory.Exists(path)) return;
        var root = new DirectoryInfo(path);
        if ((root.Attributes & FileAttributes.ReparsePoint) != 0)
        {
            throw new InvalidDataException("setup-reparse-point");
        }
        foreach (var entry in root.EnumerateFileSystemInfos())
        {
            if ((entry.Attributes & FileAttributes.ReparsePoint) != 0)
            {
                throw new InvalidDataException("setup-reparse-point");
            }
            if (entry is DirectoryInfo directory) DeleteOwnedTree(directory.FullName);
            else if (entry is FileInfo file) file.Delete();
            else throw new InvalidDataException("setup-entry-type");
        }
        root.Delete();
    }

    public static string ResolveContainedPath(string root, string relativePath)
    {
        var fullRoot = Path.GetFullPath(root);
        var candidate = Path.GetFullPath(Path.Combine(
            fullRoot, relativePath.Replace('/', Path.DirectorySeparatorChar)));
        var prefix = fullRoot.EndsWith(Path.DirectorySeparatorChar)
            ? fullRoot
            : fullRoot + Path.DirectorySeparatorChar;
        if (!candidate.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException("setup-path-escape");
        }
        return candidate;
    }

    public static void RequireNoReparseAncestors(string path)
    {
        var fullPath = Path.GetFullPath(path);
        var root = Path.GetPathRoot(fullPath) ?? throw new InvalidDataException("setup-path-root");
        var current = root;
        foreach (var segment in fullPath[root.Length..].Split(
                     Path.DirectorySeparatorChar, StringSplitOptions.RemoveEmptyEntries))
        {
            current = Path.Combine(current, segment);
            if (!Directory.Exists(current) && !File.Exists(current)) break;
            if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
            {
                throw new InvalidDataException("setup-reparse-point");
            }
        }
    }

    private static async ValueTask WriteNewFileAsync(
        string path,
        byte[] contents,
        CancellationToken cancellationToken)
    {
        await using var stream = new FileStream(
            path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4_096,
            FileOptions.Asynchronous | FileOptions.WriteThrough);
        await stream.WriteAsync(contents, cancellationToken);
        await stream.FlushAsync(cancellationToken);
    }

    private static void RequireRegularFileOrMissing(string path)
    {
        if (!File.Exists(path)) return;
        if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
        {
            throw new InvalidDataException("setup-reparse-point");
        }
    }
}
