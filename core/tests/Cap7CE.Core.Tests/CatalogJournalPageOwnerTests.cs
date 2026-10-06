using System.Globalization;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host;
using Cap7CE.Core.Host.CatalogMaintenance;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Reader.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogJournalPageOwnerTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-journal-owner-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); var owned = Path.Combine(root, "owned"); Directory.CreateDirectory(owned);
        var child = Path.Combine(owned, "child"); Directory.CreateDirectory(child);
        var cache = Path.Combine(child, "own.json"); await File.WriteAllTextAsync(cache, "{}");
        var personal = Path.Combine(root, "personal.csv"); await File.WriteAllTextAsync(personal, "a,b\n1,2");
        try {
            var ownedId = NativeFileFactSourceGuard.CaptureDirectory(owned)!;
            var childId = NativeFileFactSourceGuard.CaptureDirectory(child)!;
            var cacheId = NativeFileFactSourceGuard.Capture(cache)!.Identity;
            var personalId = NativeFileFactSourceGuard.Capture(personal)!.Identity;
            static ulong Id(CatalogEntryIdentity id) => ulong.Parse(id.FileReference, NumberStyles.HexNumber);
            static ReaderJournalRecordV2 Record(CatalogEntryIdentity id, CatalogEntryIdentity parent, bool directory, long usn) =>
                new(Id(id), Id(parent), 0x100, usn, directory ? 16u : 32u, directory, true, directory ? "child" : "personal.csv", directory ? "" : ".csv", 7, 1, 1);
            static CatalogReaderJournalPage Page(long next, params ReaderJournalRecordV2[] records) => new(true, new(0x42, 0, 0, next, true, records));
            var path = Path.Combine(root, "fixture.db"); var catalog = new CatalogV2Database(path);
            await catalog.InitializeAsync(); await catalog.RegisterVolumeAsync(ownedId.VolumeId, "X:", "NTFS", true);
            await catalog.BeginBuildAsync(ownedId.VolumeId, "42", 100, 0, 0, 1, false);
            await catalog.ApplyBatchAsync(new(ownedId.VolumeId, "42", 100, await catalog.ReadRevisionAsync(), 100, 0, 0,
                [new(ownedId, null, "owned", "", true, 16, true, null, 1, 1)]));
            await catalog.CompleteSynchronizationAsync(ownedId.VolumeId); await new FileFactDatabase(path).InitializeAsync();
            FileFactOwnedStorageRoot[] roots = [new(owned, ownedId)];
            async Task<CatalogJournalPageOwner> NewOwner() => await CatalogJournalPageOwner.CreateAsync(catalog, (await catalog.ReadVolumeAsync(ownedId.VolumeId))!, roots);
            var owner = await NewOwner(); var revision = await catalog.ReadRevisionAsync();
            var own = await owner.ProcessAsync(Page(102, Record(childId, ownedId, true, 100), Record(cacheId, childId, false, 101)));
            TestAssert.False(own.Published, "own directory plus child content page does not generate a Catalog write");
            TestAssert.Equal(revision, await catalog.ReadRevisionAsync(), "own-only page leaves global revision unchanged");
            TestAssert.Equal(100L, (await catalog.ReadVolumeAsync(ownedId.VolumeId))!.CheckpointUsn!.Value, "own-only page leaves durable prefix for reboot replay");
            var external = await owner.ProcessAsync(Page(103, Record(personalId, ownedId, false, 102)));
            TestAssert.False(external.Published, "fresh own content remains suppressed even when its basename resembles a personal file");
            var rootId = NativeFileFactSourceGuard.CaptureDirectory(root)!;
            var published = await owner.ProcessAsync(Page(104, Record(personalId, rootId, false, 103)));
            TestAssert.True(published.Published, "external event publishes staged own ancestry and checkpoint once");
            TestAssert.Equal(1, published.ExternalRecords, "only actual external record counted");
            TestAssert.Equal(1, (await new FileFactChangeLog(path).ReadPageAsync()).Count, "own-directory stage cannot create discovery hints");
            var restarted = await NewOwner();
            var ownAfterRestart = await restarted.ProcessAsync(Page(105, Record(cacheId, childId, false, 104)));
            TestAssert.False(ownAfterRestart.Published, "new own child directory remains recognized after restart past its original creation");
            var stableRevision = await catalog.ReadRevisionAsync();
            for (var usn = 105; usn < 155; usn++)
                TestAssert.False((await restarted.ProcessAsync(Page(usn + 1, Record(cacheId, childId, false, usn)))).Published, "repeated own cache events remain write-free after restart");
            TestAssert.Equal(stableRevision, await catalog.ReadRevisionAsync(), "fifty owned event pages cannot create Catalog/WAL feedback");
            await TestAssert.ThrowsAsync<CatalogReaderDiscontinuityException>(() => restarted.ProcessAsync(new(true, new(0x99, 0, 0, 156, true, []))), "journal replacement retires owner before writing");
            await TestAssert.ThrowsAsync<InvalidOperationException>(() => restarted.ProcessAsync(Page(106)), "failed instance cannot keep mutating classifier state");
            var moved = await NewOwner();
            await TestAssert.ThrowsAsync<CatalogReaderDiscontinuityException>(() => moved.ProcessAsync(Page(105, Record(childId, rootId, true, 104))), "owned directory moves outside require completeness recovery");
            var rebound = await NewOwner(); Directory.Move(owned, owned + "-old"); Directory.CreateDirectory(owned);
            await TestAssert.ThrowsAsync<InvalidOperationException>(() => rebound.ProcessAsync(Page(105)), "physically replaced own root rejected before even empty advancement");
            Directory.Delete(owned); Directory.Move(owned + "-old", owned);
            var canceled = await NewOwner(); using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
            await TestAssert.ThrowsAsync<OperationCanceledException>(() => canceled.ProcessAsync(Page(105), cancellation.Token), "pre-cancelled page has no write or identity mutation");
            var empty = await canceled.ProcessAsync(Page(104));
            TestAssert.False(empty.Published, "unchanged end-of-stream page does not write checkpoint");
            TestAssert.Equal(104L, (await catalog.ReadVolumeAsync(ownedId.VolumeId))!.CheckpointUsn!.Value, "failure and own-only tail preserve committed checkpoint");
            TestAssert.Equal("{}", await File.ReadAllTextAsync(cache), "source cache content preserved by page owner");
            TestAssert.Equal("a,b\n1,2", await File.ReadAllTextAsync(personal), "generated personal content preserved by page owner");
            var currentVolume = (await catalog.ReadVolumeAsync(ownedId.VolumeId))!;
            await TestAssert.ThrowsAsync<InvalidOperationException>(() => CatalogJournalPageOwner.CreateAsync(catalog,
                currentVolume, [new(root, rootId)]), "physically valid but absent Catalog root cannot become an implicit storage exclusion");
            TestAssert.True(await catalog.CheckIntegrityAsync(), "page owner transaction integrity");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
}
