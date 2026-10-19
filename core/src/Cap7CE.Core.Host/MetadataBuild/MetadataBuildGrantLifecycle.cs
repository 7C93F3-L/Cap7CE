using System.Text.Json;
using System.Text.Json.Nodes;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Protocol;
using Cap7CE.Core.Host.MetadataScheduling;

namespace Cap7CE.Core.Host.MetadataBuild;

public sealed record MetadataBuildGrantSnapshot(bool Consent, string Intent, FileFactQueuePolicy Policy, IReadOnlyDictionary<string, string> ScopeLabels);

// Durable permission/intention only. Load, save and identity validation do not configure an executor.
public sealed class MetadataBuildGrantLifecycle
{
    private readonly Func<Task<JsonElement?>> read;
    private readonly Func<JsonElement, Task> write;
    private readonly SemaphoreSlim gate = new(1, 1);
    private JsonObject? saved;
    private bool loaded;
    private Exception? lastWriteFailure;
    public MetadataBuildGrantLifecycle(MetadataBuildPreferencesFile file) : this(() => file.LoadAsync(), value => file.SaveAsync(value)) { }
    internal MetadataBuildGrantLifecycle(Func<Task<JsonElement?>> read, Func<JsonElement, Task> write) { this.read = read; this.write = write; }
    public async Task<MetadataBuildGrantSnapshot?> LoadAsync()
    {
        await gate.WaitAsync();
        try { await LoadInsideAsync(); return SnapshotInside(); }
        finally { gate.Release(); }
    }
    public async Task GrantAsync(FileFactQueuePolicy policy, IReadOnlyDictionary<string, string> labels, bool configured = false)
    {
        var selected = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var scope in policy.Includes.Concat(policy.Excludes)) {
            var key = scope.VolumeId + ":" + (scope.RootFileReference ?? "root");
            if (labels.TryGetValue(key, out var label) && !string.IsNullOrEmpty(label)) selected[key] = label;
        }
        var snapshot = JsonSerializer.SerializeToNode(new { version = 2, consent = !configured,
            intent = configured ? "configured" : "active", policy, scopeLabels = selected }, CoreProtocolJson.Options)!.AsObject();
        await gate.WaitAsync();
        try { await LoadInsideAsync(); await SaveInsideAsync(snapshot); }
        finally { gate.Release(); }
    }
    public async Task SetIntentAsync(string intent)
    {
        if (intent is not ("active" or "paused" or "completed")) throw new ArgumentException("metadata-build-invalid-intent");
        await gate.WaitAsync();
        try {
            await LoadInsideAsync(); if (saved is null || saved["consent"]!.GetValue<bool>() != true) return;
            var snapshot = saved.DeepClone().AsObject(); snapshot["intent"] = intent; await SaveInsideAsync(snapshot);
        }
        finally { gate.Release(); }
    }
    public async Task FlushAsync()
    {
        await gate.WaitAsync();
        try { if (lastWriteFailure is not null) System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(lastWriteFailure).Throw(); }
        finally { gate.Release(); }
    }
    public async Task ValidateAsync(CatalogStatusResponse catalog, IMetadataBuildCatalog resolver, CancellationToken token = default)
    {
        var grant = await LoadAsync(); if (grant is null) return;
        var selected = catalog.Volumes.Where(volume => volume.Selected).ToDictionary(volume => volume.VolumeId, StringComparer.Ordinal);
        if (grant.Policy.VolumeOrder.Any(volume => !selected.TryGetValue(volume, out var status) || !status.Queryable)) throw new InvalidOperationException("metadata-build-volume-unavailable");
        foreach (var scope in grant.Policy.Includes.Concat(grant.Policy.Excludes)) {
            token.ThrowIfCancellationRequested();
            if (!selected.ContainsKey(scope.VolumeId)) throw new InvalidOperationException("metadata-build-volume-unavailable");
            if (scope.RootFileReference is null) continue;
            if (!grant.ScopeLabels.TryGetValue(scope.VolumeId + ":" + scope.RootFileReference, out var label)) throw new InvalidOperationException("metadata-build-scope-unavailable");
            var resolved = await resolver.ResolveScopeAsync(new(label), token);
            token.ThrowIfCancellationRequested();
            if (!resolved.Resolved || !resolved.Queryable || resolved.VolumeId != scope.VolumeId || resolved.RootFileReference != scope.RootFileReference)
                throw new InvalidOperationException("metadata-build-scope-changed");
        }
    }
    private async Task LoadInsideAsync()
    {
        if (loaded) return;
        var value = await read();
        saved = value is null ? null : JsonNode.Parse(value.Value.GetRawText(), documentOptions: new JsonDocumentOptions { MaxDepth = 128 })!.AsObject(); loaded = true;
    }
    private async Task SaveInsideAsync(JsonObject value)
    {
        var snapshot = MetadataBuildStateSchema.Element(value);
        try { await write(snapshot); saved = value; lastWriteFailure = null; }
        catch (Exception error) when (error is not OutOfMemoryException) { lastWriteFailure = error; throw; }
    }
    private MetadataBuildGrantSnapshot? SnapshotInside()
    {
        if (saved is null) return null;
        var value = MetadataBuildStateSchema.Element(saved); var policy = value.GetProperty("policy");
        static FileFactScope[] Scopes(JsonElement scopes) => scopes.EnumerateArray().Select(scope => new FileFactScope(scope.GetProperty("volumeId").GetString()!,
            scope.GetProperty("rootFileReference").ValueKind == JsonValueKind.Null ? null : scope.GetProperty("rootFileReference").GetString())).ToArray();
        return new(value.GetProperty("consent").GetBoolean(), value.GetProperty("intent").GetString()!,
            new(policy.GetProperty("volumeOrder").EnumerateArray().Select(item => item.GetString()!).ToArray(), Scopes(policy.GetProperty("includes")), Scopes(policy.GetProperty("excludes"))),
            value.GetProperty("scopeLabels").EnumerateObject().ToDictionary(item => item.Name, item => item.Value.GetString()!, StringComparer.Ordinal));
    }
}
