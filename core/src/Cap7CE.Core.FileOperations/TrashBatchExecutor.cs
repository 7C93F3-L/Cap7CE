namespace Cap7CE.Core.FileOperations;

// One private-session owner supplies serialization. No source body reads or direct deletion fallback.
public sealed class TrashBatchExecutor
{
    private readonly Func<string, WindowsFileOperationResult> recycle;
    private readonly TimeProvider clock;
    private readonly Func<TimeSpan, Task> delay;
    private long? finished;
    public TrashBatchExecutor(Func<string, WindowsFileOperationResult>? recycle = null, TimeProvider? clock = null, Func<TimeSpan, Task>? delay = null)
    {
        this.recycle = recycle ?? WindowsFileOperation.RecycleItem; this.clock = clock ?? TimeProvider.System;
        this.delay = delay ?? (value => Task.Delay(value));
    }
    public async Task<TrashBatchResult> RunAsync(IReadOnlyList<TrashTarget> source, IReadOnlyList<string> cacheRoots, bool catalog)
    {
        var targets = TrashPathRules.Targets(source, catalog);
        var deleted = new List<string>(); var failed = new List<TrashFailure>(); var folders = new List<string>();
        foreach (var target in targets) {
            try {
                if (catalog && folders.Any(folder => TrashPathRules.Within(target.Path, folder))) { deleted.Add(target.Path); continue; }
                if (TrashPathRules.Protected(target.Path, cacheRoots)) throw new TrashException("protected-path");
                if (catalog) TrashSourceMetadata.Validate(target, followLinks: false, catalog: true);
                await RetryAsync(target);
                deleted.Add(target.Path); if (catalog && target.IsDirectory) folders.Add(target.Path);
            }
            catch (TrashException error) { failed.Add(new(target.Path, error.Message, error.NativeError)); }
            catch { failed.Add(new(target.Path, "shell-failed")); }
        }
        return new(targets.Count > 0 && failed.Count == 0, targets.Count, deleted, failed);
    }
    private async Task RetryAsync(TrashTarget target)
    {
        TrashException? failure = null;
        for (var attempt = 0; attempt < 2; attempt++) {
            try {
                TrashSourceMetadata.Validate(target, followLinks: true, catalog: false);
                if (finished is { } previous) {
                    var remaining = TimeSpan.FromMilliseconds(250) - clock.GetElapsedTime(previous);
                    if (remaining > TimeSpan.Zero) await delay(remaining);
                }
                WindowsFileOperationResult result;
                try { result = recycle(target.Path); } finally { finished = clock.GetTimestamp(); }
                if (result.Status != "deleted") throw new TrashException(result.Error == -2147467260 ? "aborted" : "shell-failed", result.Error);
                return;
            }
            catch (TrashException error) { failure = error; }
            catch { failure = new("shell-failed"); }
        }
        throw failure!;
    }
}
