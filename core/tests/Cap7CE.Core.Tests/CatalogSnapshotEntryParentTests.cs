using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Cap7CE.Core.Catalog.FileFacts;

namespace Cap7CE.Core.Tests;

internal static class CatalogSnapshotEntryParentTests
{
    public static async Task RunAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        var catalog = new CatalogV2Database(fixture.DatabasePath); await catalog.InitializeAsync(createEntryCatalog: true);
        const string volume = "snapshot-parent";
        await catalog.RegisterVolumeAsync(volume, "S:", "NTFS", true);
        var root = Node(5, 5, ".", true); var file = Node(11, 5, "old.png"); var healthy = Node(12, 5, "healthy.png");
        var fresh = Node(13, 5, "fresh.png"); var missing = Node(99, 5, "late-directory", true);
        var store = new CatalogFileEntryStore(catalog); var facts = new FileFactDatabase(fixture.DatabasePath); await facts.InitializeAsync();
        await Publish([root, file, healthy], [Names(file, new CatalogFileName(Ref(5), "old.png")), Names(healthy, new CatalogFileName(Ref(5), "healthy.png"))], false);
        var changed = file with { Name = "new.png" };
        var entries = new[] { Names(changed, new(Ref(5), "new.png"), new(Ref(99), "late.png")),
            Names(healthy, new CatalogFileName(Ref(5), "healthy.png")), Names(fresh, new(Ref(5), "fresh.png"), new(Ref(99), "fresh-alias.png")) };
        await Publish([root, changed, healthy, fresh], entries, true);
        TestAssert.Equal(CatalogV2VolumeState.Ready, (await catalog.ReadVolumeAsync(volume))!.State, "one unobserved parent does not reject a whole volume snapshot");
        TestAssert.Equal("old.png", (await store.ReadAsync(file.Identity))!.Entries.Single().Name, "unresolved alias retains the previous complete set");
        TestAssert.True(await store.ReadAsync(fresh.Identity) is null, "a fresh identity never publishes only its healthy alias");
        TestAssert.Equal("healthy.png", (await store.ReadAsync(healthy.Identity))!.Entries.Single().Name, "other identities publish normally");
        var pending = new CatalogFileEntryPending(catalog);
        TestAssert.Equal(2L, (await pending.ReadDueAsync(volume, 0)).Waiting, "both incomplete identities enter the durable retry queue");
        TestAssert.True(await facts.CaptureAsync(file.Identity) is null && await facts.CaptureAsync(fresh.Identity) is null,
            "unknown aliases cannot authorize content extraction through the old or canonical name");
        TestAssert.True(await facts.CaptureAsync(healthy.Identity) is not null, "complete unrelated identities retain extraction eligibility");
        await catalog.MarkNeedsRebuildAsync(volume);
        await using (var cancelled = await catalog.BeginSnapshotBuildAsync(volume, "1", 3, 0, 0, 4, true, captureFileEntries: true)) {
            await cancelled.AppendWithEntriesAsync(new([root, changed, healthy, fresh], entries));
            using var stop = new CancellationTokenSource(); stop.Cancel();
            await TestAssert.ThrowsAsync<OperationCanceledException>(() => cancelled.PublishAsync(stop.Token), "cancelled parent validation cannot publish a partial snapshot");
        }
        TestAssert.Equal(2L, (await pending.ReadDueAsync(volume, 0)).Waiting, "cancellation preserves the durable retry generation");
        await Publish([root, changed, healthy, fresh, missing], entries, true);
        TestAssert.Equal(2, (await store.ReadAsync(file.Identity))!.Entries.Count, "a later complete snapshot restores every name atomically");
        TestAssert.Equal(2, (await store.ReadAsync(fresh.Identity))!.Entries.Count, "fresh deferred identity also recovers its complete set");
        TestAssert.Equal(0L, (await pending.ReadDueAsync(volume, 0)).Waiting, "resolved snapshot replaces the pending generation");
        TestAssert.True(await facts.CaptureAsync(file.Identity) is not null, "confirmed aliases restore extraction eligibility");
        TestAssert.True(await catalog.CheckIntegrityAsync(), "parent deferral and recovery preserve SQLite integrity");

        async Task Publish(IReadOnlyList<CatalogV2NodeRecord> nodes, IReadOnlyList<CatalogFileEntryUpdate> updates, bool rebuild)
        {
            if (rebuild && (await catalog.ReadVolumeAsync(volume))!.State != CatalogV2VolumeState.NeedsRebuild) await catalog.MarkNeedsRebuildAsync(volume);
            await using var build = await catalog.BeginSnapshotBuildAsync(volume, "1", 3, 0, 0, nodes.Count, rebuild, captureFileEntries: true);
            await build.AppendWithEntriesAsync(new(nodes, updates)); await build.PublishAsync();
        }
        CatalogV2NodeRecord Node(ulong reference, ulong parent, string name, bool directory = false) =>
            new(new(volume, Ref(reference)), Ref(parent), name, directory ? "" : ".png", directory, directory ? 16 : 32, true, directory ? null : 10, 1, 2);
    }
    private static string Ref(ulong value) => value.ToString("X16");
    private static CatalogFileEntryUpdate Names(CatalogV2NodeRecord node, params CatalogFileName[] names) =>
        new(node.Identity, new(node.CreatedUtcTicks, node.ModifiedUtcTicks, node.SizeBytes), names);
}
