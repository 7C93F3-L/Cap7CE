using System.Text.Json;
using System.Text.Json.Nodes;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataBuild;
using Cap7CE.Core.Host.MetadataScheduling;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Tests;

internal static class MetadataBuildGrantLifecycleTests
{
    private static readonly string Volume = new('a', 32), Folder = new('1', 16);
    private static readonly FileFactQueuePolicy Policy = new([Volume], [new(Volume, Folder)], []);
    private static readonly Dictionary<string, string> Labels = new() { [Volume + ":" + Folder] = "X:\\Assets", [new string('b', 32) + ":root"] = "Y:\\" };
    public static async Task RunAsync()
    {
        JsonElement? persisted = null; var reads = 0; var writes = 0; var fail = false; TaskCompletionSource? pending = null;
        MetadataBuildGrantLifecycle Create() => new(() => { reads++; return Task.FromResult(persisted?.Clone()); }, async value => {
            TestAssert.True(MetadataBuildStateSchema.Preferences(value), "all durable states retain the legacy schema");
            if (pending is not null) await pending.Task;
            if (fail) throw new IOException("synthetic persistence failure"); persisted = value.Clone(); writes++;
        });
        var lifecycle = Create();
        TestAssert.True(await lifecycle.LoadAsync() is null, "fresh install grants nothing");
        await lifecycle.GrantAsync(Policy, Labels, configured: true); var configured = (await lifecycle.LoadAsync())!;
        TestAssert.False(configured.Consent, "configuration is not permission"); TestAssert.Equal(1, configured.ScopeLabels.Count, "only selected scope labels saved");
        var before = writes; await lifecycle.SetIntentAsync("paused"); TestAssert.Equal(before, writes, "pause cannot promote configuration into consent");
        TestAssert.Equal(1, reads, "one cached lifecycle load");
        await lifecycle.GrantAsync(Policy, Labels); TestAssert.True((await lifecycle.LoadAsync())!.Consent, "explicit grant persisted");
        var catalog = new Catalog(); await lifecycle.ValidateAsync(catalog.Status, catalog); TestAssert.Equal(1, catalog.Resolutions, "folder identity validated before restore");
        foreach (var changed in new[] { catalog.Resolution with { RootFileReference = new('2', 16) }, catalog.Resolution with { VolumeId = new('b', 32) }, catalog.Resolution with { Queryable = false } }) {
            catalog.Resolution = changed; await TestAssert.ThrowsAsync<InvalidOperationException>(() => lifecycle.ValidateAsync(catalog.Status, catalog), "rebound directory cannot inherit grant");
        }
        await TestAssert.ThrowsAsync<InvalidOperationException>(() => lifecycle.ValidateAsync(catalog.Status with { Volumes = [] }, catalog), "removed volume blocks restoration");
        var snapshot = (await lifecycle.LoadAsync())!; ((string[])snapshot.Policy.VolumeOrder)[0] = new('b', 32);
        TestAssert.Equal(Volume, (await lifecycle.LoadAsync())!.Policy.VolumeOrder[0], "caller cannot mutate owned grant");
        await lifecycle.SetIntentAsync("paused"); fail = true;
        await TestAssert.ThrowsAsync<IOException>(() => lifecycle.SetIntentAsync("completed"), "failed edit rejected");
        await TestAssert.ThrowsAsync<IOException>(() => lifecycle.FlushAsync(), "shutdown retains an uncorrected persistence failure");
        TestAssert.Equal("paused", (await lifecycle.LoadAsync())!.Intent, "failed write retains memory and durable state"); fail = false;
        pending = new(TaskCreationOptions.RunContinuationsAsynchronously);
        var granting = lifecycle.GrantAsync(Policy, Labels); var pausing = lifecycle.SetIntentAsync("paused"); var flushing = lifecycle.FlushAsync();
        TestAssert.False(flushing.IsCompleted, "shutdown waits accepted persistent operations"); pending.SetResult();
        await Task.WhenAll(granting, pausing, flushing); pending = null;
        TestAssert.Equal("paused", persisted!.Value.GetProperty("intent").GetString(), "later pause follows durable grant in order");
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-grant-lifecycle-" + Guid.NewGuid().ToString("N"));
        try {
            var store = new MetadataBuildPreferencesFile(root); var real = new MetadataBuildGrantLifecycle(store);
            TestAssert.True(await real.LoadAsync() is null, "missing state is passive"); TestAssert.False(Directory.Exists(root), "read creates no data directory");
            var document = JsonNode.Parse(persisted.Value.GetRawText())!.AsObject(); JsonNode nested = JsonValue.Create("未知字段")!;
            for (var depth = 0; depth < 80; depth++) nested = new JsonArray(nested);
            document["future"] = nested; document["policy"]!["futurePolicy"] = true;
            await store.SaveAsync(MetadataBuildStateSchema.Element(document));
            real = new(store); await real.LoadAsync(); await real.SetIntentAsync("completed");
            var saved = (await store.LoadAsync())!.Value; var future = saved.GetProperty("future");
            for (var depth = 0; depth < 80; depth++) future = future[0];
            TestAssert.Equal("未知字段", future.GetString(), "intent edits preserve deep unknown UTF8 fields");
            TestAssert.True(saved.GetProperty("policy").GetProperty("futurePolicy").GetBoolean(), "unknown policy field preserved");
            TestAssert.Equal(1, Directory.GetFiles(root).Length, "lifecycle only persists its own configuration");
        }
        finally {
            TestAssert.True(Path.GetFullPath(root).StartsWith(Path.GetTempPath(), StringComparison.OrdinalIgnoreCase) && Path.GetFileName(root).StartsWith("Cap7CE-grant-lifecycle-", StringComparison.Ordinal), "owned fixture cleanup");
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
        Console.WriteLine("Core metadata grants: configuration/permission separation, identity validation, failed-write preservation, ordered pause/flush and unknown-field retention passed.");
    }
    private sealed class Catalog : IMetadataBuildCatalog
    {
        internal CatalogStatusResponse Status = new([new(Volume, "X:", "NTFS", true, "ready", 0, null, true, false)], [], 1);
        internal CatalogResolveScopeResponse Resolution = new(true, Volume, Folder, "X:", "ready", true);
        internal int Resolutions;
        public Task<CatalogStatusResponse> ReadStatusAsync(CancellationToken token) => Task.FromResult(Status);
        public Task<CatalogResolveScopeResponse> ResolveScopeAsync(CatalogResolveScopeRequest request, CancellationToken token) { token.ThrowIfCancellationRequested(); Resolutions++; return Task.FromResult(Resolution); }
    }
}
