namespace Cap7CE.Core.FileOperations;

// One private session owns serial batches. No direct deletion fallback or success cooldown.
public sealed class TrashBatchExecutor
{
    private readonly Func<IReadOnlyList<string>, IReadOnlyList<WindowsFileOperationResult>> recycle;
    private readonly Func<TimeSpan, Task> delay;
    public TrashBatchExecutor(Func<string, WindowsFileOperationResult>? recycle = null,
        Func<TimeSpan, Task>? delay = null, Func<IReadOnlyList<string>, IReadOnlyList<WindowsFileOperationResult>>? batch = null)
    {
        this.recycle = batch ?? (recycle is null ? WindowsTrashBatch.Execute : paths => paths.Select(recycle).ToArray());
        this.delay = delay ?? (value => Task.Delay(value));
    }
    public async Task<TrashBatchResult> RunAsync(IReadOnlyList<TrashTarget> source, IReadOnlyList<string> cacheRoots, bool catalog)
    {
        var targets = TrashPathRules.Targets(source, catalog);
        var pending = targets.ToList(); var deleted = new List<string>(); var failed = new List<TrashFailure>(); var folders = new List<string>();
        while (pending.Count > 0) {
            var ready = new List<TrashTarget>();
            foreach (var target in pending.ToArray()) {
                if (catalog && folders.Any(folder => TrashPathRules.Within(target.Path, folder))) { deleted.Add(target.Path); pending.Remove(target); continue; }
                if (catalog && ready.Any(parent => parent.IsDirectory && TrashPathRules.Within(target.Path, parent.Path))) continue;
                pending.Remove(target);
                try { Validate(target, cacheRoots, catalog); ready.Add(target); }
                catch (TrashException error) { failed.Add(new(target.Path, error.Message, error.NativeError)); }
                catch { failed.Add(new(target.Path, "shell-failed")); }
            }
            for (var attempt = 0; attempt < 2 && ready.Count > 0; attempt++) {
                var retry = new List<TrashTarget>();
                IReadOnlyList<WindowsFileOperationResult> results;
                try { results = recycle(ready.Select(item => item.Path).ToArray()); }
                catch { results = ready.Select(_ => new WindowsFileOperationResult("failed")).ToArray(); }
                for (var i = 0; i < ready.Count; i++) {
                    var target = ready[i]; var result = i < results.Count ? results[i] : new("failed");
                    if (result.Status == "deleted") { deleted.Add(target.Path); if (catalog && target.IsDirectory) folders.Add(target.Path); continue; }
                    if (attempt == 0 && result.Error != -2147467260) {
                        try { Validate(target, cacheRoots, catalog); retry.Add(target); continue; }
                        catch (TrashException error) { failed.Add(new(target.Path, error.Message, error.NativeError)); continue; }
                        catch { failed.Add(new(target.Path, "shell-failed")); continue; }
                    }
                    failed.Add(new(target.Path, result.Error == -2147467260 ? "aborted" : "shell-failed", result.Error));
                }
                ready = retry;
                if (ready.Count > 0) await delay(TimeSpan.FromMilliseconds(250));
            }
        }
        return new(targets.Count > 0 && failed.Count == 0, targets.Count, deleted, failed);
    }
    private static void Validate(TrashTarget target, IReadOnlyList<string> roots, bool catalog)
    {
        if (TrashPathRules.Protected(target.Path, roots)) throw new TrashException("protected-path");
        if (catalog) TrashSourceMetadata.Validate(target, followLinks: false, catalog: true);
        TrashSourceMetadata.Validate(target, followLinks: true, catalog: false);
    }
}
