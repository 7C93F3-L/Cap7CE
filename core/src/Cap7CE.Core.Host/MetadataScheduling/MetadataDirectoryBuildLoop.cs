using Cap7CE.Core.Host.MetadataBuild;

namespace Cap7CE.Core.Host.MetadataScheduling;

public sealed partial class MetadataBuildCoordinator
{
    private void Kick()
    {
        lock (gate) {
            if (running is not null || closing || saving > 0 || queue.Intent != "active" || queue.Count == 0) return;
            var abort = cancellation = new();
            running = Task.Run(async () => {
                try {
                    bool suspend; lock (gate) { suspend = !suspended; if (suspend) suspended = true; }
                    if (suspend) await global.SuspendForDirectoryAsync();
                    while (true) {
                        MetadataDirectoryJob job;
                        lock (gate) { if (closing || queue.Intent != "active" || queue.Count == 0) break; current = job = queue.First; progress = new("preparing"); }
                        abort.Token.ThrowIfCancellationRequested();
                        var scope = await MetadataDirectoryScopeResolver.ResolveAsync(job, catalog, abort.Token,
                            () => { lock (gate) progress = progress with { Phase = "waiting" }; }, waitMilliseconds);
                        lock (gate) job.Scope = scope;
                        await SaveAsync(); abort.Token.ThrowIfCancellationRequested();
                        sweep.Start(new([scope.VolumeId], [scope], []), true); await sweep.WaitForIdleAsync(); abort.Token.ThrowIfCancellationRequested();
                        lock (gate) { if (progress.Phase != "completed") throw Error(progress.ErrorCode ?? "metadata-directory-failed"); queue.RemoveFirst(); }
                        await SaveAsync();
                    }
                    bool release; lock (gate) release = queue.Count == 0 && !closing && !abort.IsCancellationRequested;
                    if (release) { await global.ReleaseDirectoryAsync(); lock (gate) suspended = false; }
                }
                catch (Exception error) when (error is not OutOfMemoryException) {
                    if (!abort.IsCancellationRequested) {
                        lock (gate) { queue.Intent = "paused"; progress = progress with { Phase = "failed", ErrorCode = System.Text.RegularExpressions.Regex.IsMatch(error.Message, "^metadata-[a-z-]+$") ? error.Message : "metadata-directory-failed" }; }
                        try { await SaveAsync(); } catch (Exception saveError) when (saveError is not OutOfMemoryException) { lock (gate) progress = progress with { ErrorCode = "metadata-directory-state-unavailable" }; }
                    }
                }
                finally { bool restart; lock (gate) { running = null; cancellation = null; restart = queue.Intent == "active"; } abort.Dispose(); if (restart) Kick(); }
            });
        }
    }
    private async Task SaveAsync()
    {
        lock (gate) saving++;
        try {
            Task accepted;
            lock (gate) {
                var snapshot = queue.Snapshot(); var previous = storeWrites;
                accepted = storeWrites = Task.Run(async () => { try { await previous; } catch (Exception error) when (error is not OutOfMemoryException) { } await write(snapshot); });
            }
            await accepted;
        }
        catch (Exception cause) when (cause is not OutOfMemoryException) {
            lock (gate) { queue.Intent = "paused"; cancellation?.Cancel(); }
            await sweep.PauseAsync();
            var error = cause as MetadataDirectoryStateException ?? new("write", new MetadataStateIOException("write", cause));
            lock (gate) progress = progress with { Phase = "failed", ErrorCode = error.Message, StorageError = error.Details };
            throw error;
        }
        finally { lock (gate) saving--; }
    }
    private async Task PauseDirectoryAsync(bool persist)
    {
        Task? work; lock (gate) { if (persist) queue.Intent = "paused"; cancellation?.Cancel(); work = running; }
        await sweep.PauseAsync(); if (work is not null) await work;
        if (persist) await SaveAsync();
        lock (gate) if (queue.Count > 0) progress = progress with { Phase = "paused", ErrorCode = null, RemainingSeconds = null };
    }
}
