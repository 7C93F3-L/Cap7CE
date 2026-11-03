using System.Collections;
namespace Cap7CE.WinUI.Services;

// Transient UI suppression while Catalog catches up; a restored path must become visible again.
internal sealed class DeletedPathTracker(Func<string, bool>? exists = null) : IEnumerable<string>
{
    private readonly object gate = new();
    private readonly Dictionary<string, long> paths = new(StringComparer.OrdinalIgnoreCase);
    private long revision;
    public void Add(string path) { lock (gate) paths[path] = ++revision; }
    public void UnionWith(IEnumerable<string> values) { foreach (var path in values) Add(path); }
    public IEnumerator<string> GetEnumerator() { lock (gate) return paths.Keys.ToArray().AsEnumerable().GetEnumerator(); }
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    public async Task ReconcileAsync(CancellationToken token)
    {
        KeyValuePair<string, long>[] snapshot; lock (gate) snapshot = paths.ToArray();
        if (snapshot.Length == 0) return;
        var restored = await Task.Run(() => {
            var found = new List<KeyValuePair<string, long>>();
            foreach (var item in snapshot) {
                token.ThrowIfCancellationRequested();
                if ((exists ?? Exists)(item.Key)) found.Add(item);
            }
            return found;
        }, token);
        token.ThrowIfCancellationRequested();
        lock (gate) foreach (var item in restored)
            if (paths.TryGetValue(item.Key, out var current) && current == item.Value) paths.Remove(item.Key);
    }
    private static bool Exists(string path)
    {
        try { _ = File.GetAttributes(path); return true; }
        catch (IOException) { return false; }
        catch (UnauthorizedAccessException) { return false; }
    }
}
