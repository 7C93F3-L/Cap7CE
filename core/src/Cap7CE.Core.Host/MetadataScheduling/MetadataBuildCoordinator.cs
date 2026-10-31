using System.Text.Json;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataBuild;
using Cap7CE.Core.Host.MetadataExtraction;

namespace Cap7CE.Core.Host.MetadataScheduling;

// Temporary directory grants borrow one session without replacing the saved global policy.
public sealed partial class MetadataBuildCoordinator
{
    private readonly object gate = new();
    private readonly MetadataGlobalBuildOwner global;
    private readonly IMetadataBuildCatalog catalog;
    private readonly MetadataBuildSweep sweep;
    private readonly Func<Task<JsonElement?>> read;
    private readonly Func<JsonElement, Task> write;
    private readonly int waitMilliseconds;
    private MetadataDirectoryQueueState queue = new();
    private MetadataDirectoryJob? current;
    private MetadataBuildProgress progress = new("preparing");
    private Task? loading, running;
    private Task storeWrites = Task.CompletedTask;
    private CancellationTokenSource? cancellation;
    private long actionRevision, directoryRevision;
    private int saving;
    private bool closing, suspended;
    public MetadataBuildCoordinator(MetadataGlobalBuildOwner global, IMetadataBuildSession session, IMetadataBuildCatalog catalog,
        MetadataDirectoryQueueFile file, IReadOnlyList<FileFactChangeSpecification> specifications, int yieldMilliseconds = 15, int waitMilliseconds = 1000)
        : this(global, session, catalog, () => file.LoadAsync(), value => file.SaveAsync(value), specifications, yieldMilliseconds, waitMilliseconds) { }
    internal MetadataBuildCoordinator(MetadataGlobalBuildOwner global, IMetadataBuildSession session, IMetadataBuildCatalog catalog,
        Func<Task<JsonElement?>> read, Func<JsonElement, Task> write, IReadOnlyList<FileFactChangeSpecification> specifications, int yieldMilliseconds = 15, int waitMilliseconds = 1000)
    {
        this.global = global; this.catalog = catalog; this.read = read; this.write = write; this.waitMilliseconds = waitMilliseconds;
        sweep = new(session, specifications, value => { lock (gate) progress = value; }, yieldMilliseconds, waitMilliseconds);
    }
    public Task<MetadataBuildScope> ResolveScopeAsync(string path, CancellationToken token = default) => global.ResolveScopeAsync(path, token);
    public async Task<MetadataBuildStatus> ReadAsync(CancellationToken token = default)
    {
        await LoadAsync(); var result = await global.ReadAsync(token);
        lock (gate) {
            var active = result.Progress.Phase is not ("idle" or "completed" or "paused" or "failed");
            return current is not null && (queue.Count > 0 || running is not null || result.Policy is null && !active || progress.Phase == "failed")
                ? result with { Progress = progress, DirectoryTask = new(current.Path, queue.Count) } : result;
        }
    }
    public async Task<MetadataBuildStatus> SavePolicyAsync(FileFactQueuePolicy policy, CancellationToken token = default)
    {
        long own; lock (gate) own = ++actionRevision;
        await LoadAsync(); lock (gate) if (queue.Count > 0 || running is not null || closing) throw Error("metadata-directory-busy");
        var result = await global.SavePolicyAsync(policy, token);
        lock (gate) { if (own != actionRevision) throw Error("metadata-build-start-cancelled"); current = null; } return result;
    }
    public async Task<MetadataBuildStatus> StartAsync(FileFactConfigurationRequest request, CancellationToken token = default)
    {
        long own; lock (gate) own = ++actionRevision;
        await LoadAsync(); Task? work; lock (gate) { if (queue.Count > 0) throw Error("metadata-directory-busy"); work = running; }
        if (work is not null) await work;
        lock (gate) { if (own != actionRevision || closing) throw Error("metadata-build-start-cancelled"); if (queue.Count > 0) throw Error("metadata-directory-busy"); current = null; }
        return await global.StartAsync(request, token);
    }
    public async Task<MetadataBuildStatus> PauseAsync()
    {
        lock (gate) { actionRevision++; directoryRevision++; }
        await LoadAsync(); bool directory; lock (gate) { if (closing) throw Error("metadata-build-start-cancelled"); directory = queue.Count > 0 || running is not null; }
        if (directory) { await PauseDirectoryAsync(persist: true); lock (gate) directory = queue.Count > 0; if (directory) return await ReadAsync(); }
        lock (gate) current = null; return await global.PauseAsync();
    }
    public async Task<MetadataBuildStatus> ResumeAsync(CancellationToken token = default)
    {
        await LoadAsync(); bool directory; Task? writing = null;
        lock (gate) { if (closing) throw Error("metadata-build-start-cancelled"); directory = queue.Count > 0; if (!directory) current = null; else { queue.Intent = "active"; progress = new("preparing"); writing = SaveAsync(); } }
        if (!directory) return await global.ResumeAsync(token);
        await writing!; Kick(); return await ReadAsync(token);
    }
    public async Task<MetadataBuildStatus> CancelAsync() {
        await LoadAsync();
        lock(gate) { if(closing)throw Error("metadata-build-start-cancelled");if(queue.Count>0||running is not null)throw Error("metadata-directory-busy");actionRevision++;current=null; }
        return await global.CancelAsync();
    }
    public async Task<MetadataBuildStatus> CancelDirectoriesAsync()
    {
        lock (gate) { directoryRevision++; actionRevision++; }
        await LoadAsync(); lock (gate) if (closing) throw Error("metadata-build-start-cancelled"); await PauseDirectoryAsync(persist: true);
        Task writing; lock (gate) { if (closing) throw Error("metadata-build-start-cancelled"); queue.Clear(); writing = SaveAsync(); } await writing; bool release;
        lock (gate) { current = null; release = suspended; }
        if (release) { await global.ReleaseDirectoryAsync(); lock (gate) suspended = false; }
        return await global.ReadAsync();
    }
    public async Task RestoreAsync(CancellationToken token = default)
    {
        await LoadAsync(); bool directory; lock (gate) directory = queue.Count > 0;
        if (directory) Kick(); else await global.RestoreAsync(token);
    }
    public async Task NotifyCatalogChangeAsync()
    {
        await LoadAsync(); lock (gate) if (queue.Count > 0 || running is not null || closing) return;
        await global.RestoreAsync(); await global.NotifyCatalogChangeAsync();
    }
    public async Task ShutdownAsync()
    {
        lock (gate) { closing = true; actionRevision++; directoryRevision++; }
        try { await LoadAsync(); await PauseDirectoryAsync(persist: false); Task writing; lock (gate) writing = storeWrites; await writing; }
        finally { await global.ShutdownAsync(); }
    }
    private Task LoadAsync()
    {
        lock (gate) return loading ??= Task.Run(async () => {
            var saved = await read(); lock (gate) {
                queue = new(saved); if (queue.Count > 0) { current = queue.First; progress = new(queue.Intent == "paused" ? "paused" : "preparing"); }
            }
        });
    }
    private static InvalidOperationException Error(string code) => new(code);
}
