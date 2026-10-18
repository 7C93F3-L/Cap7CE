namespace Cap7CE.Core.Host.CatalogStorage;

// Held for the owner's entire lifetime. A crash releases the OS handle;
// the empty sidecar may remain and is never treated as a persistent lock.
public sealed class CatalogStorageLease : IDisposable
{
    private readonly FileStream handle;
    private CatalogStorageLease(FileStream handle) { this.handle = handle; }
    public static CatalogStorageLease Acquire(string databasePath, bool createDirectory = false)
    {
        var path = Path.GetFullPath(databasePath);
        if (createDirectory) Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        else if (!File.Exists(path)) throw new FileNotFoundException("Catalog storage is missing.");
        RejectReparsePoint(path);
        var ownerPath = path + ".owner";
        RejectReparsePoint(ownerPath);
        return new(File.Open(ownerPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None));
    }
    internal static void RejectReparsePoint(string path)
    {
        if (File.Exists(path) && (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
            throw new IOException("Catalog maintenance does not follow reparse points.");
    }
    public void Dispose() => handle.Dispose();
}
