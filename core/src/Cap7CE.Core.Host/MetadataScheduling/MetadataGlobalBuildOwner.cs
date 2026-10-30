using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataBuild;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host.MetadataScheduling;

// Owns the durable global grant and asynchronous control ordering; directory work borrows this same session.
public sealed partial class MetadataGlobalBuildOwner
{
    private readonly object gate = new();
    private readonly IMetadataBuildSession session;
    private readonly IMetadataBuildCatalog catalog;
    private readonly MetadataBuildGrantLifecycle lifecycle;
    private readonly MetadataBuildSweep sweep;
    private readonly MetadataBuildChangeDrain drain;
    private readonly Dictionary<string, string> scopeLabels = new(StringComparer.Ordinal);
    private MetadataBuildVolume[] volumes = [];
    private FileFactQueuePolicy? policy;
    private string? savedIntent, errorCode;
    private Task? loading, pendingWrite, restoration;
    private long revision, runRevision;
    private int stopping;
    private bool preparing, maintenance, initialSweep, borrowed, closing;
    public MetadataGlobalBuildOwner(IMetadataBuildSession session, IMetadataBuildCatalog catalog, MetadataBuildGrantLifecycle lifecycle,
        IReadOnlyList<FileFactChangeSpecification> specifications, int yieldMilliseconds = 15, int waitMilliseconds = 1000)
    {
        this.session = session; this.catalog = catalog; this.lifecycle = lifecycle;
        sweep = new(session, specifications, OnProgress, yieldMilliseconds, waitMilliseconds);
        drain = new(sweep, BeginMaintenance, failedRevision => { lock (gate) if (revision == failedRevision) { maintenance = false; errorCode = "metadata-build-maintenance-failed"; } });
    }
    public async Task<MetadataBuildStatus> ReadAsync(CancellationToken token = default) { await RefreshAsync(token); return Snapshot(); }
    public async Task<MetadataBuildScope> ResolveScopeAsync(string path, CancellationToken token = default)
    {
        if (path is null || path.Length is < 3 or > 32768 || !char.IsAsciiLetter(path[0]) || path[1] != ':' || path[2] is not ('\\' or '/')) throw Error("metadata-build-invalid-directory");
        await RefreshAsync(token); var scope = await catalog.ResolveScopeAsync(new(path), token);
        lock (gate) {
            if (!scope.Resolved || !scope.Queryable || scope.VolumeId is null || !volumes.Any(volume => volume.VolumeId == scope.VolumeId)) throw Error("metadata-build-directory-unavailable");
            scopeLabels[scope.VolumeId + ":" + (scope.RootFileReference ?? "root")] = path;
        }
        return new(scope.VolumeId, scope.RootFileReference, path);
    }
    public async Task<MetadataBuildStatus> SavePolicyAsync(FileFactQueuePolicy value, CancellationToken token = default)
    {
        var own = Prepare();
        try {
            await RefreshAsync(token); var selected = SelectPolicy(value);
            lock (gate) { CheckRevision(own); maintenance = false; initialSweep = false; }
            drain.Reset(); await drain.WaitForIdleAsync(); await sweep.WaitForIdleAsync();
            bool pause; lock (gate) { CheckRevision(own); pause = policy is not null && savedIntent != "configured"; }
            if (pause) await session.PauseAsync(CancellationToken.None);
            await PersistGrantAsync(selected, configured: true, own);
            lock (gate) { policy = selected; savedIntent = "configured"; errorCode = null; }
            return Snapshot();
        }
        finally { lock (gate) preparing = false; }
    }
    public Task<MetadataBuildStatus> StartAsync(FileFactConfigurationRequest request, CancellationToken token = default, long? expectedRevision = null)
    {
        if (!request.AllowMetadataExtraction) throw Error("metadata-build-confirmation-required");
        return StartPreparedAsync(request, token, Prepare(expectedRevision));
    }
    private async Task<MetadataBuildStatus> StartPreparedAsync(FileFactConfigurationRequest request, CancellationToken token, long own)
    {
        try {
            drain.Reset(); await drain.WaitForIdleAsync(); await sweep.WaitForIdleAsync(); await RefreshAsync(token);
            var selected = SelectPolicy(request.Policy); await PersistGrantAsync(selected, configured: false, own);
            lock (gate) {
                CheckRevision(own); policy = selected; savedIntent = "active"; errorCode = null;
                maintenance = true; initialSweep = true; runRevision = own; sweep.Start(selected, true);
            }
            return Snapshot();
        }
        finally { lock (gate) preparing = false; }
    }
    public async Task<MetadataBuildStatus> PauseAsync() { lock (gate) if (closing) throw Error("metadata-build-start-cancelled"); await StopAsync(persist: true); return Snapshot(); }
    public async Task<MetadataBuildStatus> CancelAsync() { lock (gate) if (closing || borrowed) throw Error("metadata-build-busy"); await StopAsync(persist: false, cancel: true); return Snapshot(); }
    public async Task<MetadataBuildStatus> ResumeAsync(CancellationToken token = default)
    {
        await LoadAsync(); FileFactQueuePolicy selected; long own;
        lock (gate) {
            if (preparing || stopping > 0 || closing) throw Error("metadata-build-busy");
            if (policy is null || Snapshot().Progress.Phase != "paused") throw Error("metadata-build-not-paused"); selected = policy; own = revision;
        }
        return await StartAsync(new(true, selected), token, expectedRevision: own);
    }
    public async Task NotifyCatalogChangeAsync()
    {
        long current; lock (gate) { if (!maintenance || closing || borrowed) return; current = revision; }
        drain.Notify(current); await drain.WaitForIdleAsync();
    }
    public async Task SuspendForDirectoryAsync() { lock (gate) borrowed = true; await StopAsync(persist: false); }
    public async Task ReleaseDirectoryAsync()
    {
        FileFactQueuePolicy? selected; string? intent; long own;
        lock (gate) { borrowed = false; selected = policy; intent = savedIntent; own = revision; if (closing) return; }
        if (selected is not null && intent == "active") await StartAsync(new(true, selected), expectedRevision: own);
        else if (selected is not null && intent == "completed") {
            lock (gate) { if (revision != own || stopping > 0 || closing) return; maintenance = true; }
            drain.Notify(own); await drain.WaitForIdleAsync();
        }
        else await session.PauseAsync(CancellationToken.None);
    }
    public async Task ShutdownAsync() { lock (gate) closing = true; await StopAsync(persist: false); await lifecycle.FlushAsync(); }
    private async Task StopAsync(bool persist, bool cancel = false)
    {
        Task? writing;
        lock (gate) {
            PersistTerminalProgress(sweep.Snapshot, atStop: true);
            revision++; stopping++; maintenance = false; initialSweep = false; writing = pendingWrite;
        }
        drain.Reset();
        try {
            await LoadAsync(); var dormant = Inactive(sweep.Snapshot.Phase);
            await sweep.PauseAsync(); await drain.WaitForIdleAsync();
            if (writing is not null) { try { await writing; } catch (Exception error) when (error is not OutOfMemoryException) { } }
            var grant = await lifecycle.LoadAsync();var hadConsent=grant?.Consent==true;
            if(cancel && grant is not null) { await lifecycle.GrantAsync(grant.Policy,grant.ScopeLabels,configured:true);grant=await lifecycle.LoadAsync();lock(gate)errorCode=null; }
            if (persist && grant?.Consent == true) { await lifecycle.SetIntentAsync("paused"); grant = await lifecycle.LoadAsync(); }
            lock (gate) if (grant is not null) Adopt(grant);
            if (dormant && hadConsent) await session.PauseAsync(CancellationToken.None);
        }
        finally { lock (gate) stopping--; }
    }
    private long Prepare(long? expectedRevision = null)
    {
        lock (gate) {
            if (expectedRevision is not null && revision != expectedRevision) throw Error("metadata-build-start-cancelled");
            if (preparing || stopping > 0 || closing || borrowed || !Inactive(sweep.Snapshot.Phase)) throw Error("metadata-build-busy");
            preparing = true; return ++revision;
        }
    }
    private async Task PersistGrantAsync(FileFactQueuePolicy selected, bool configured, long own)
    {
        Task writing;
        lock (gate) { CheckRevision(own); pendingWrite = writing = lifecycle.GrantAsync(selected, new Dictionary<string, string>(scopeLabels), configured); }
        try { await writing; }
        finally { lock (gate) if (ReferenceEquals(pendingWrite, writing)) pendingWrite = null; }
    }
    private void CheckRevision(long own) { if (revision != own || closing || stopping > 0 || borrowed) throw Error("metadata-build-start-cancelled"); }
    private static bool Inactive(string phase) => phase is "idle" or "paused" or "completed" or "failed";
    private static InvalidOperationException Error(string code) => new(code);
}
