using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactDiscoveryTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-fact-discovery-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "fixture.db");
        try
        {
            await new CatalogV2Database(path).InitializeAsync();
            var facts = new FileFactDatabase(path);
            await facts.InitializeAsync();
            await using (var connection = new SqliteConnection($"Data Source={path};Pooling=False"))
            {
                await connection.OpenAsync(); using var command = connection.CreateCommand();
                command.CommandText = """
                    INSERT INTO catalog_volumes_v2 VALUES('a','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                    INSERT INTO catalog_volumes_v2 VALUES('b','Y:','NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                    INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000001',NULL,'root','',1,16,1,0,1,1);
                    INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000002','0000000000000001','nested','',1,16,1,0,1,1);
                    INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000011','0000000000000002','one.png','.png',0,32,1,100,1,133000000000000003);
                    INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000012','0000000000000001','two.png','.png',0,32,1,100,1,133000000000000003);
                    INSERT INTO catalog_nodes_v2 VALUES('b','0000000000000011',NULL,'three.png','.png',0,32,1,100,1,133000000000000003);
                    INSERT INTO catalog_nodes_v2 VALUES('b','0000000000000012',NULL,'four.PNG','.PNG',0,32,1,100,1,133000000000000003);
                    INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000013',NULL,'blocked.png','.png',0,1024,1,100,1,133000000000000003);
                    INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000014',NULL,'deleted.png','.png',0,32,0,100,1,133000000000000003);
                    INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000015',NULL,'incomplete.png','.png',0,32,1,100,1,NULL);
                    INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000016',NULL,'directory.png','',1,16,1,100,1,133000000000000003);
                    """;
                await command.ExecuteNonQueryAsync();
            }
            var discovery = new FileFactDiscovery(path);
            var all = new FileFactQueuePolicy(["b", "a"], [new("a"), new("b")], []);
            var first = await discovery.ReadPageAsync(all, FileFactKind.ImageDimensions, 1, [".PNG"], pageSize: 1);
            TestAssert.Equal("b", first.Jobs.Single().Identity.VolumeId, "discovery follows explicit drive priority");
            var identities = new List<CatalogEntryIdentity>(first.Jobs.Select(job => job.Identity));
            var cursor = first.Next;
            for (var count = 0; cursor is not null && count < 10; count++)
            {
                var page = await discovery.ReadPageAsync(all, FileFactKind.ImageDimensions, 1, [".png", ".PNG"], cursor, 1);
                identities.AddRange(page.Jobs.Select(job => job.Identity)); cursor = page.Next;
            }
            TestAssert.True(cursor is null && identities.Count == 4 && identities.Distinct().Count() == 4,
                "bounded discovery crosses volumes without duplicates and skips unsafe/incomplete nodes");
            TestAssert.Equal(new CatalogEntryIdentity("a", "0000000000000012"), identities.Last(), "final ordered discovery identity");
            var failed = new CatalogEntryIdentity("b", "0000000000000012");
            await facts.PublishAsync(new(failed, (await facts.CaptureAsync(failed))!, FileFactKind.ImageDimensions, 1,
                FileFactState.Failed, ErrorCode: "fixture-failure"));
            var cached = await discovery.ReadPageAsync(all, FileFactKind.ImageDimensions, 1, [".png"]);
            TestAssert.Equal(3, cached.Jobs.Count, "versioned failures are not rediscovered repeatedly");
            await facts.InvalidateContentAsync(failed);
            TestAssert.Equal(4, (await discovery.ReadPageAsync(all, FileFactKind.ImageDimensions, 1, [".png"])).Jobs.Count,
                "content invalidation schedules a new source generation");
            var restricted = all with { Excludes = [new("a", "0000000000000002")] };
            var changedFile = new FileFactCatalogChange(1, new("a", "0000000000000011"), false);
            TestAssert.Equal(changedFile.Identity, (await discovery.ReadChangedPageAsync(all, FileFactKind.ImageDimensions, 1, [".png"], changedFile)).Jobs.Single().Identity,
                "one file change cannot rediscover unrelated files");
            var changedFolder = new FileFactCatalogChange(2, new("a", "0000000000000002"), true);
            TestAssert.Equal(changedFile.Identity, (await discovery.ReadChangedPageAsync(all, FileFactKind.ImageDimensions, 1, [".png"], changedFolder)).Jobs.Single().Identity,
                "folder move discovery includes only descendants");
            TestAssert.Equal(0, (await discovery.ReadChangedPageAsync(restricted, FileFactKind.ImageDimensions, 1, [".png"], changedFolder)).Jobs.Count,
                "changed subtree still intersects current exclusions");
            var changedVolume = new FileFactCatalogChange(3, new("b", "0000000000000000"), true);
            var changedFirst = await discovery.ReadChangedPageAsync(all, FileFactKind.ImageDimensions, 1, [".png"], changedVolume, pageSize: 1);
            TestAssert.True(changedFirst.Next is not null, "volume rebuild discovery remains paged");
            TestAssert.Equal(new CatalogEntryIdentity("b", "0000000000000012"),
                (await discovery.ReadChangedPageAsync(all, FileFactKind.ImageDimensions, 1, [".png"], changedVolume, changedFirst.Next, 1)).Jobs.Single().Identity,
                "targeted keyset keeps change and scope");
            await TestAssert.ThrowsAsync<ArgumentException>(() => discovery.ReadChangedPageAsync(all, FileFactKind.ImageDimensions, 1,
                [".png"], changedVolume with { Sequence = 4 }, changedFirst.Next), "new change generation rejects previous targeted cursor");
            await TestAssert.ThrowsAsync<ArgumentException>(() => discovery.ReadPageAsync(all, FileFactKind.ImageDimensions, 1,
                [".png"], changedFirst.Next), "targeted cursor cannot expand into full discovery");
            TestAssert.Equal(3, (await discovery.ReadPageAsync(restricted, FileFactKind.ImageDimensions, 1, [".png"])).Jobs.Count,
                "exclusion follows identity parent chain");
            var paused = all with { Includes = [] };
            TestAssert.Equal(0, (await discovery.ReadPageAsync(paused, FileFactKind.ImageDimensions, 1, [".png"])).Jobs.Count,
                "empty allowed range discovers nothing");
            await TestAssert.ThrowsAsync<ArgumentException>(() => discovery.ReadPageAsync(restricted,
                FileFactKind.ImageDimensions, 1, [".png"], first.Next), "changed policy rejects old discovery cursor");
            await TestAssert.ThrowsAsync<ArgumentException>(() => discovery.ReadPageAsync(all,
                FileFactKind.ImageDimensions, 2, [".png"], first.Next), "changed extractor rejects old discovery cursor");
            await TestAssert.ThrowsAsync<ArgumentException>(() => discovery.ReadPageAsync(all,
                FileFactKind.Video, 1, [".png"], first.Next), "changed kind rejects old discovery cursor");
            await TestAssert.ThrowsAsync<ArgumentException>(() => discovery.ReadPageAsync(all,
                FileFactKind.ImageDimensions, 1, [".png' OR 1=1"]), "discovery extensions are strictly scalar");
            using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
            await TestAssert.ThrowsAsync<OperationCanceledException>(() => discovery.ReadPageAsync(all,
                FileFactKind.ImageDimensions, 1, [".png"], token: cancelled.Token), "discovery cancellation");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
}
