using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;

namespace Cap7CE.Core.Tests;

internal static class CatalogEntrySnapshotFenceTests
{
    public static async Task RunAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        var catalog = new CatalogV2Database(fixture.DatabasePath); await catalog.InitializeAsync();
        await catalog.RegisterVolumeAsync("entry-snapshot", "S:", "NTFS", true);
        var store = new CatalogFileEntryStore(catalog); await store.InitializeAsync();
        var root = new CatalogV2NodeRecord(new("entry-snapshot", "0000000000000005"), "0000000000000005", ".", "", true, 16, true, null, 1, 2);
        var file = new CatalogV2NodeRecord(new("entry-snapshot", "000000000000000B"), root.Identity.FileReference, "file.png", ".png", false, 32, true, 10, 1, 2);
        var changes = new CatalogFileEntryChanges([root, file], [new(file.Identity, new(1, 2, 10), [new(root.Identity.FileReference, "file.png"), new(root.Identity.FileReference, "alias.png")])]);
        await using (var first = await catalog.BeginSnapshotBuildAsync("entry-snapshot", "1", 1, 0, 0, 2, false, captureFileEntries: true)) {
            await first.AppendWithEntriesAsync(changes);
            await catalog.MarkNeedsRebuildAsync("entry-snapshot");
            await using var second = await catalog.BeginSnapshotBuildAsync("entry-snapshot", "1", 2, 0, 0, 2, true, captureFileEntries: true);
            await second.AppendWithEntriesAsync(changes);
            await TestAssert.ThrowsAsync<CatalogConcurrencyException>(() => first.PublishAsync(), "retired build cannot overwrite a newer snapshot owner");
            TestAssert.True(await store.ReadAsync(file.Identity) is null, "rejected old owner publishes no entry rows");
            await second.PublishAsync();
        }
        TestAssert.Equal(2L, (await catalog.ReadVolumeAsync("entry-snapshot"))!.CheckpointUsn!.Value, "new owner retains its own snapshot checkpoint");
        var previous = (await store.ReadAsync(file.Identity))!;
        await catalog.MarkNeedsRebuildAsync("entry-snapshot");
        await using (var rejected = await catalog.BeginSnapshotBuildAsync("entry-snapshot", "1", 3, 0, 0, 2, true, captureFileEntries: true)) {
            var invalid = changes with { Entries = [changes.Entries[0] with { Source = new(1, 2, 11) }] };
            await TestAssert.ThrowsAsync<ArgumentException>(() => rejected.AppendWithEntriesAsync(invalid), "snapshot page source mismatch retires the complete builder");
            await TestAssert.ThrowsAsync<InvalidOperationException>(() => rejected.PublishAsync(), "caught page failure cannot be published as partial success");
        }
        TestAssert.True(previous.Entries.SequenceEqual((await store.ReadAsync(file.Identity))!.Entries), "failed staged page leaves durable entry data intact");
        TestAssert.True(await catalog.CheckIntegrityAsync(), "entry snapshot failures preserve SQLite integrity");
    }
}
