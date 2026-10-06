using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactQueryTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-fact-query-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "fixture.db");
        try
        {
            var catalog = new CatalogV2Database(path);
            await catalog.InitializeAsync();
            var beforeConsent = new CatalogV2Query("", [], CatalogQueryScope.AllVolumes(), null,
                CatalogEntryType.File, 100, null, new(FileFactKind.ImageDimensions, 1));
            var emptyFacts = await catalog.QueryAsync(beforeConsent);
            TestAssert.Equal(0, emptyFacts.Items.Count, "before consent unknown metadata never matches");
            TestAssert.Equal(0L, emptyFacts.FactRevision!.Value, "uninitialized metadata coverage is zero");
            await TestAssert.ThrowsAsync<CatalogConcurrencyException>(() => catalog.QueryAsync(beforeConsent with {
                ExpectedRevision = new(emptyFacts.CatalogRevision, 1) }), "absent metadata still enforces revision fence");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(beforeConsent with {
                Facts = beforeConsent.Facts! with { MinimumWidth = -1 } }), "absent metadata still validates predicates");
            await using (var untouched = new SqliteConnection("Data Source=" + path))
            {
                await untouched.OpenAsync();
                using var check = untouched.CreateCommand();
                check.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE name GLOB 'file_fact_*';";
                TestAssert.Equal(0L, Convert.ToInt64(await check.ExecuteScalarAsync()), "query never initializes metadata or grants consent");
            }
            var facts = new FileFactDatabase(path);
            await facts.InitializeAsync();
            await ExecuteAsync(path, """
                INSERT INTO catalog_volumes_v2 VALUES('a','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                INSERT INTO catalog_volumes_v2 VALUES('b','Y:','NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000001',NULL,'.','',1,16,1,NULL,1,1);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000002','0000000000000001','素材%_','',1,16,1,NULL,1,1);
                INSERT INTO catalog_directory_paths_v2 VALUES('a','0000000000000001','');
                INSERT INTO catalog_directory_paths_v2 VALUES('a','0000000000000002','素材%_');
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000010','0000000000000002','same.png','.png',0,32,1,100,1,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000011','0000000000000001','same.png','.png',0,32,1,100,1,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('b','0000000000000010',NULL,'same.png','.png',0,32,1,100,1,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000012','0000000000000002','movie.mp4','.mp4',0,32,1,100,1,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000013','0000000000000002','unknown.png','.png',0,32,1,100,1,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000014','0000000000000002','before.png','.png',0,32,1,100,1,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000015','0000000000000002','large.png','.png',0,32,1,100,1,133000000000000003);
                """);
            CatalogEntryIdentity Identity(string volume, int reference) => new(volume, reference.ToString("X16"));
            async Task PublishAsync(string volume, int reference, FileFactKind kind, int version,
                int? width, int? height, long? duration = null, FileFactState state = FileFactState.Indexed)
            {
                var identity = Identity(volume, reference);
                await facts.PublishAsync(new(identity, (await facts.CaptureAsync(identity))!, kind, version, state, width, height, duration));
            }
            await PublishAsync("a", 16, FileFactKind.ImageDimensions, 1, 800, 400);
            await PublishAsync("a", 17, FileFactKind.ImageDimensions, 1, 400, 800);
            await PublishAsync("b", 16, FileFactKind.ImageDimensions, 1, 600, 600);
            await PublishAsync("a", 18, FileFactKind.Video, 1, 1920, 1080, 90_123);
            await PublishAsync("a", 19, FileFactKind.ImageDimensions, 1, null, null, state: FileFactState.Unknown);
            await PublishAsync("a", 21, FileFactKind.ImageDimensions, 2, 1000, 1000);
            await ProductFactSearchTests.RunAsync(catalog, facts);
            var filter = new FileFactQueryFilter(FileFactKind.ImageDimensions, 1);
            var query = new CatalogV2Query("same", [], CatalogQueryScope.AllVolumes(), null, CatalogEntryType.File, 1, null, filter);
            var first = await catalog.QueryAsync(query);
            TestAssert.Equal(Identity("a", 16), first.Items.Single().Identity, "name/volume/reference compound order first");
            TestAssert.Equal(await facts.ReadRevisionAsync(), first.FactRevision!.Value, "fact revision from query snapshot");
            var second = await catalog.QueryAsync(query with { After = first.Next });
            var third = await catalog.QueryAsync(query with { After = second.Next });
            TestAssert.Equal(Identity("a", 17), second.Items.Single().Identity, "same name keyset second");
            TestAssert.Equal(Identity("b", 16), third.Items.Single().Identity, "cross-volume keyset third");
            TestAssert.True(third.Next is null, "final page has no next cursor");
            var all = query with { Query = "", PageSize = 200 };
            TestAssert.Equal(3, (await catalog.QueryAsync(all)).Items.Count, "failed/pending/different extractor excluded");
            TestAssert.Equal(2, (await catalog.QueryAsync(all with { Facts = filter with { MinimumWidth = 500 } })).Items.Count, "width condition");
            TestAssert.Equal(1, (await catalog.QueryAsync(all with { Facts = filter with { MinimumAspectRatio = new(2, 1), MaximumAspectRatio = new(2, 1) } })).Items.Count, "exact rational aspect boundary");
            TestAssert.Equal(1, (await catalog.QueryAsync(all with { Facts = filter with { MaximumAspectRatio = new(1, 2) } })).Items.Count, "portrait aspect condition");
            var disjoint = filter with { AspectRanges = [new(Maximum: new(1, 2)), new(Minimum: new(2, 1))] };
            TestAssert.Equal(2, (await catalog.QueryAsync(all with { Facts = disjoint })).Items.Count, "two disjoint aspect selections form union without square between them");
            TestAssert.Equal(0, (await catalog.QueryAsync(all with { Facts = disjoint with { MinimumWidth = 900 } })).Items.Count, "aspect union still intersects dimensions");
            TestAssert.Equal(1, (await catalog.QueryAsync(all with { Facts = filter with {
                AspectRanges = [new(Minimum: new(1, 2), Maximum: new(2, 1), MinimumInclusive: false, MaximumInclusive: false)] } })).Items.Count, "exclusive aspect endpoints exclude both boundary orientations and retain square");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(all with { Facts = filter with { AspectRanges = [] } }), "empty aspect choices rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(all with { Facts = filter with { AspectRanges = [new(new(1, 1), new(1, 1), false)] } }), "empty exclusive aspect interval rejected");
            TestAssert.Equal(1, (await catalog.QueryAsync(all with { Facts = new(FileFactKind.Video, 1, MinimumWidth: 1900, MinimumDurationMilliseconds: 90_000, MaximumDurationMilliseconds: 91_000) })).Items.Count, "video duration and dimensions intersection");
            TestAssert.Equal(1, (await catalog.QueryAsync(all with { Facts = new(FileFactKind.Video, 1, ShortEdgeRanges: [new(1080, 1439)]) })).Items.Count, "resolution uses short edge independent of orientation");
            TestAssert.Equal(0, (await catalog.QueryAsync(all with { Facts = new(FileFactKind.Video, 1, ShortEdgeRanges: [new(720, 1079), new(1440, 2159)]) })).Items.Count, "disjoint resolution choices do not include intervening resolution");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(all with { Facts = filter with { ShortEdgeRanges = [new(0)] } }), "nonpositive short edge rejected");
            TestAssert.Equal(1, (await catalog.QueryAsync(all with { Scope = CatalogQueryScope.DirectChildren("a", "0000000000000002") })).Items.Count, "direct children AND facts");
            TestAssert.Equal(2, (await catalog.QueryAsync(all with { Scope = CatalogQueryScope.Descendants("a", "0000000000000001") })).Items.Count, "descendants AND facts");
            TestAssert.Equal(0, (await catalog.QueryAsync(all with { Extension = ".mp4" })).Items.Count, "extension does not union unrelated facts");
            TestAssert.Equal(0, (await catalog.QueryAsync(all with { Query = "素材%_", TextTarget = CatalogQueryTextTarget.Name })).Items.Count, "name mode preserves legacy semantics");
            TestAssert.Equal(1, (await catalog.QueryAsync(all with { Query = "X:\\素材%_\\same", TextTarget = CatalogQueryTextTarget.Path })).Items.Count, "full drive path and literal wildcard characters");
            TestAssert.Equal(1, (await catalog.QueryAsync(all with { Query = "素材%_", TextTarget = CatalogQueryTextTarget.NameOrPath })).Items.Count, "name/path target intersects properties");
            TestAssert.Equal(0, (await catalog.QueryAsync(all with { Query = "素材Zx", TextTarget = CatalogQueryTextTarget.Path })).Items.Count, "percent and underscore never act as wildcards");
            TestAssert.Equal(1, (await catalog.QueryAsync(all with { Query = "large", Facts = filter with { ExtractorVersion = 2 } })).Items.Count, "requested extractor version supported");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(all with { Facts = filter with { MinimumAspectRatio = new(3, 1), MaximumAspectRatio = new(2, 1) } }), "reversed aspect interval rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(all with { Facts = filter with { MinimumDurationMilliseconds = 1 } }), "image duration mismatch rejected");
            await PublishAsync("a", 20, FileFactKind.ImageDimensions, 1, 700, 700);
            await TestAssert.ThrowsAsync<CatalogConcurrencyException>(() => catalog.QueryAsync(query with {
                After = first.Next, ExpectedRevision = new(first.CatalogRevision, first.FactRevision) }), "strict fact revision detects growing coverage");
            var live = await catalog.QueryAsync(query with { After = first.Next, ExpectedRevision = new(first.CatalogRevision) });
            TestAssert.Equal(Identity("a", 17), live.Items.Single().Identity, "live keyset survives facts growth without duplicates");
            TestAssert.True(live.FactRevision > first.FactRevision, "live page reports new coverage version");
            TestAssert.Equal(Identity("a", 20), (await catalog.QueryAsync(all with { PageSize = 1 })).Items.Single().Identity, "refresh includes new earlier match");
            await facts.InvalidateVolumeAsync("a");
            TestAssert.Equal(1, (await catalog.QueryAsync(all)).Items.Count, "stale source generation never matches query");
            TestAssert.Equal(7, (await catalog.QueryAsync(all with { Facts = null })).Items.Count, "base browsing remains independent of property coverage");
            await ExecuteAsync(path, """
                WITH RECURSIVE sequence(x) AS(SELECT 1 UNION ALL SELECT x + 1 FROM sequence WHERE x < 60000)
                INSERT INTO catalog_nodes_v2
                SELECT 'b', printf('%016X', 100000 + x), NULL, printf('dense-%06d.dense', x), '.dense',
                    0, 32, 1, 100, 1, 133000000000000003 FROM sequence;
                INSERT INTO file_facts
                SELECT volume_id, file_reference, 0, 1, 0, size_bytes, modified_utc_ticks, 0, 0,
                    CASE WHEN CAST(substr(name, 7, 6) AS INTEGER) <= 20000 THEN 1500
                        WHEN CAST(substr(name, 7, 6) AS INTEGER) % 10 = 0 THEN 8000 ELSE 500 END,
                    500, NULL, NULL FROM catalog_nodes_v2 WHERE extension = '.dense';
                UPDATE file_fact_state SET fact_revision = fact_revision + 1;
                ANALYZE main;
                """);
            foreach (var width in new[] { 400, 1000, 7000 })
            {
                var planned = all with { PageSize = 37, Extension = ".dense", Facts = filter with { MinimumWidth = width } };
                var page = await catalog.QueryAsync(planned);
                var expectedStart = width == 7000 ? 20010 : 1;
                var step = width == 7000 ? 10 : 1;
                TestAssert.Equal(37, page.Items.Count, "all adaptive query plans return full page");
                for (var index = 0; index < page.Items.Count; index++)
                    TestAssert.Equal(Identity("b", 100000 + expectedStart + index * step), page.Items[index].Identity, "adaptive plan agrees with independent fixture sequence");
                var nextPage = await catalog.QueryAsync(planned with { After = page.Next });
                TestAssert.Equal(Identity("b", 100000 + expectedStart + 37 * step), nextPage.Items[0].Identity, "adaptive keyset continues without overlap");
                var textPage = await catalog.QueryAsync(planned with { Query = "dense-" });
                TestAssert.True(textPage.Items.Select(item => item.Identity).SequenceEqual(page.Items.Select(item => item.Identity)), "sequential text plan preserves same ordered intersection");
            }
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }

    private static async Task ExecuteAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection($"Data Source={path};Pooling=False");
        await connection.OpenAsync();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync();
    }
}
