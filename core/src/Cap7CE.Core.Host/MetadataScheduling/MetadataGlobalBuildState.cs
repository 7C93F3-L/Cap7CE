using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataBuild;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host.MetadataScheduling;

public sealed partial class MetadataGlobalBuildOwner
{
    private MetadataBuildStatus Snapshot()
    {
        lock (gate) {
            var progress = sweep.Snapshot;
            progress = errorCode is not null ? progress with { Phase = "failed", ErrorCode = errorCode }
                : savedIntent == "configured" ? progress with { Phase = "idle", ErrorCode = null }
                : savedIntent == "paused" && progress.Phase is "idle" or "completed" ? progress with { Phase = "paused" }
                : progress.Phase == "idle" && savedIntent == "completed" ? progress with { Phase = "completed" } : progress;
            return new(progress, volumes.ToArray(), policy is null ? null : MetadataBuildPolicyCopy.Copy(policy), new Dictionary<string, string>(scopeLabels));
        }
    }
    private Task LoadAsync()
    {
        lock (gate) return loading ??= Task.Run(async () => { var saved = await lifecycle.LoadAsync(); lock (gate) if (saved is not null) Adopt(saved); });
    }
    private void Adopt(MetadataBuildGrantSnapshot saved)
    {
        policy = MetadataBuildPolicyCopy.Copy(saved.Policy); savedIntent = saved.Intent;
        foreach (var label in saved.ScopeLabels) scopeLabels[label.Key] = label.Value;
    }
    private async Task<CatalogStatusResponse> RefreshAsync(CancellationToken token)
    {
        await LoadAsync(); var status = await catalog.ReadStatusAsync(token);
        lock (gate) volumes = status.Volumes.Where(volume => volume.Selected).Select(volume => new MetadataBuildVolume(volume.VolumeId, volume.DisplayName)).ToArray();
        return status;
    }
    private FileFactQueuePolicy SelectPolicy(FileFactQueuePolicy value)
    {
        try { FileFactQueue.ValidatePolicy(value); } catch (ArgumentException) { throw Error("metadata-build-invalid-policy"); }
        var selected = MetadataBuildPolicyCopy.Copy(value);
        lock (gate) if (selected.VolumeOrder.Count == 0 || selected.VolumeOrder.Any(id => !volumes.Any(volume => volume.VolumeId == id))) throw Error("metadata-build-invalid-policy");
        return selected;
    }
    private void OnProgress(MetadataBuildProgress progress)
        => PersistTerminalProgress(progress, atStop: false);
    private void PersistTerminalProgress(MetadataBuildProgress progress, bool atStop)
    {
        if (progress.Phase is not ("completed" or "failed")) return;
        Task saving; long own; bool notify;
        lock (gate) {
            if (runRevision != revision || stopping > 0 || !atStop && (closing || borrowed)) return;
            var intent = progress.Phase == "completed" ? "completed" : "paused";
            if (savedIntent == intent) return;
            own = revision; savedIntent = intent;
            pendingWrite = saving = lifecycle.SetIntentAsync(savedIntent); notify = !atStop && initialSweep && progress.Phase == "completed"; initialSweep = false;
        }
        _ = ObserveSaveAsync(saving, own); if (notify) drain.Notify(own);
    }
    private async Task ObserveSaveAsync(Task saving, long own)
    {
        try { await saving; }
        catch (Exception error) when (error is not OutOfMemoryException) { lock (gate) if (revision == own) { maintenance = false; errorCode = "metadata-build-preferences-unavailable"; } }
    }
    private bool BeginMaintenance(long own)
    {
        lock (gate) {
            if (revision != own || !maintenance || preparing || stopping > 0 || closing || borrowed || policy is null || savedIntent is not ("active" or "completed")) return false;
            runRevision = own; sweep.Start(policy, true, changesOnly: true); return true;
        }
    }
    public Task RestoreAsync(CancellationToken token = default)
    {
        lock (gate) {
            var own = revision;
            return restoration ??= Task.Run(async () => {
                var deferred = false; var startRevision = -1L;
                try {
                    var status = await RefreshAsync(token); FileFactQueuePolicy? selected; string? intent;
                    lock (gate) {
                        selected = policy; intent = savedIntent;
                        if (!CanRestore(own) || selected is null || intent is not ("active" or "completed")) return;
                    }
                    if (status.Tasks.Any(task => task.State == "running") || status.Volumes.Any(volume => selected.VolumeOrder.Contains(volume.VolumeId)
                        && volume.State is "building" or "discovering" or "catchingUp")) { deferred = true; return; }
                    await lifecycle.ValidateAsync(status, catalog, token);
                    lock (gate) { if (!CanRestore(own)) return; if (intent == "completed") maintenance = true; }
                    if (intent == "completed") drain.Notify(own);
                    else { startRevision = Prepare(own); await StartPreparedAsync(new(true, selected), token, startRevision); }
                }
                catch (Exception error) when (error is not OutOfMemoryException) {
                    lock (gate) if (revision == own || revision == startRevision) errorCode = System.Text.RegularExpressions.Regex.IsMatch(error.Message, "^metadata-build-[a-z-]+$") ? error.Message : "metadata-build-restore-failed";
                }
                finally { if (deferred) lock (gate) restoration = null; }
            });
        }
    }
    private bool CanRestore(long own) => revision == own && !preparing && stopping == 0 && !closing && !borrowed && sweep.Snapshot.Phase == "idle";
}
