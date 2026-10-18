using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogTextCandidateTests
{
    public static async Task RunAsync()
    {
        foreach (var entries in new[] { false, true }) {
            using var fixture = new TemporaryCatalogFixture();
            var catalog = new CatalogV2Database(fixture.DatabasePath); await catalog.InitializeAsync(createEntryCatalog: entries);
            await Sql("""
                INSERT INTO catalog_volumes_v2 VALUES('text-c','C:','NTFS',1,'1',1,0,0,'ready',7,7,0),('text-d','D:','NTFS',1,'1',1,0,0,'ready',2,2,0);
                INSERT INTO catalog_nodes_v2 VALUES
                ('text-c','0000000000000005','0000000000000005','.','',1,16,1,NULL,1,2),
                ('text-c','0000000000000010','0000000000000005','Projects','',1,16,1,NULL,1,2),
                ('text-c','0000000000000011','0000000000000010','blue folder蓝','',1,16,1,NULL,1,2),
                ('text-c','0000000000000020','0000000000000010','logo%_A.png','.png',0,32,1,10,1,2),
                ('text-c','0000000000000021','0000000000000011','leaf.txt','.txt',0,34,1,20,1,3),
                ('text-c','0000000000000030','0000000000000099','detached','',1,16,1,NULL,1,2),
                ('text-c','0000000000000031','0000000000000099','legacy.png','.png',0,32,1,30,1,4),
                ('text-d','0000000000000005','0000000000000005','.','',1,16,1,NULL,1,2),
                ('text-d','0000000000000020','0000000000000005','d-only.bin','.bin',0,34,1,10,1,2);
                INSERT INTO catalog_directory_paths_v2 VALUES
                ('text-c','0000000000000005',''),('text-c','0000000000000010','Projects'),
                ('text-c','0000000000000011','Projects\blue folder蓝'),('text-d','0000000000000005','');
                INSERT INTO catalog_manual_keywords VALUES
                ('text-c','0000000000000020','1','["logo","sea_wave"]','logo sea_wave',0),
                ('text-c','0000000000000020','2','["obsolete"]','obsolete',0);
                """);
            if (entries) await new CatalogFileEntryStore(catalog).ReplaceAsync(new("text-c", "0000000000000020"), new(1, 2, 10), 0,
                [new("0000000000000010", "logo%_A.png"), new("0000000000000011", "other.png"),
                 new("0000000000000011", "logo%_A.png"), new("0000000000000030", "retired.png")]);
            var basis = new CatalogV2Query("", [], CatalogQueryScope.AllVolumes(), null, CatalogEntryType.Any, 100, null);
            foreach (var retired in new[] { false, true }) {
                if (retired) await Sql("UPDATE catalog_nodes_v2 SET exists_flag=0 WHERE volume_id='text-c' AND file_reference='0000000000000011';");
                var all = (await catalog.QueryAsync(basis)).Items;
                foreach (var text in new[] { "", "logo", "blue", "sea_wave", "obsolete", "%", "_", "logo%_a", ".", "蓝", "detached",
                    "C:", "c:\\", "C: leaf", "Projects\\blue", "logo blue", "logo Projects\\blue", "Projects\\blue logo", " projects    blue " })
                foreach (var target in Enum.GetValues<CatalogQueryTextTarget>()) {
                    var expected = all.Where(item => Matches(item, text, target)).Select(Key).Order().ToArray();
                    var actual = (await catalog.QueryAsync(basis with { Query = text, TextTarget = target })).Items.Select(Key).Order().ToArray();
                    TestAssert.True(expected.SequenceEqual(actual), $"literal text semantics remain identical: entries={entries}, retired={retired}, target={target}, text={text}");
                }
                var filtered = basis with { Query = "blue", TextTarget = CatalogQueryTextTarget.NamePathOrKeywords, VolumeIds = ["text-c"], ExcludeHidden = true };
                var visible = all.Where(item => item.Identity.VolumeId == "text-c" && (item.Attributes & 2) == 0 && Matches(item, "blue", filtered.TextTarget));
                TestAssert.True(visible.Select(Key).Order().SequenceEqual((await catalog.QueryAsync(filtered)).Items.Select(Key).Order()), "candidate keys preserve volume and hidden filters");
                if (!retired) {
                    await Sql("UPDATE catalog_nodes_v2 SET created_utc_ticks=3 WHERE volume_id='text-c' AND file_reference='0000000000000020';");
                    TestAssert.Equal(0, (await catalog.QueryAsync(basis with { Query = "sea_wave", TextTarget = CatalogQueryTextTarget.NamePathOrKeywords })).Items.Count, "stale keyword candidates never cross physical creation versions");
                    TestAssert.Equal(0, (await catalog.QueryAsync(basis with { Query = "other", TextTarget = CatalogQueryTextTarget.NamePathOrKeywords })).Items.Count, "stale complete sets never revive an alias");
                    TestAssert.Equal(1, (await catalog.QueryAsync(basis with { Query = "logo", TextTarget = CatalogQueryTextTarget.NamePathOrKeywords })).Items.Count, "changed creation version keeps only the original canonical fallback");
                    await Sql("UPDATE catalog_nodes_v2 SET created_utc_ticks=1 WHERE volume_id='text-c' AND file_reference='0000000000000020';");
                }
                await Sql("UPDATE catalog_volumes_v2 SET selected=0 WHERE volume_id='text-d';");
                TestAssert.Equal(0, (await catalog.QueryAsync(basis with { Query = "D:", TextTarget = CatalogQueryTextTarget.NamePathOrKeywords })).Items.Count, "text candidates cannot expose a deselected volume");
                await Sql("UPDATE catalog_volumes_v2 SET selected=1,state='offline' WHERE volume_id='text-d';");
                TestAssert.Equal(0, (await catalog.QueryAsync(basis with { Query = "D:", TextTarget = CatalogQueryTextTarget.NamePathOrKeywords })).Items.Count, "text candidates cannot expose an offline volume");
                await Sql("UPDATE catalog_volumes_v2 SET state='ready' WHERE volume_id='text-d';");
                foreach (var sort in Enum.GetValues<CatalogQuerySort>())
                foreach (var seed in new uint?[] { null, 42 }) {
                    var query = basis with { Query = "png", TextTarget = CatalogQueryTextTarget.NamePathOrKeywords, PageSize = 1, Sort = sort, RandomSeed = seed };
                    var paged = new List<string>();
                    do {
                        var page = await catalog.QueryAsync(query); paged.AddRange(page.Items.Select(Key)); query = query with { After = page.Next };
                        TestAssert.True(paged.Count <= all.Count, "text candidate cursor cannot repeat entries");
                    } while (query.After is not null);
                    TestAssert.True(all.Where(item => Matches(item, "png", query.TextTarget)).Select(Key).Order().SequenceEqual(paged.Order()), "all sort and random cursors preserve each alias exactly once");
                }
            }
            async Task Sql(string text)
            {
                await using var connection = new SqliteConnection($"Data Source={fixture.DatabasePath};Pooling=False"); await connection.OpenAsync();
                using var command = connection.CreateCommand(); command.CommandText = text; await command.ExecuteNonQueryAsync();
            }
        }
    }
    private static string Key(CatalogV2QueryItem item) => $"{item.Identity.VolumeId}|{item.Identity.FileReference}|{item.EntryKey}|{item.RelativePath}";
    private static bool Matches(CatalogV2QueryItem item, string text, CatalogQueryTextTarget target)
    {
        var path = (item.Identity.VolumeId == "text-c" ? "C:" : "D:") + "\\" + item.RelativePath;
        var keywords = item.Identity.VolumeId == "text-c" && item.Identity.FileReference == "0000000000000020" ? "logo sea_wave" : "";
        return text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).All(term => target switch {
            CatalogQueryTextTarget.Name => item.Name.Contains(term, StringComparison.OrdinalIgnoreCase),
            CatalogQueryTextTarget.Path => path.Contains(term, StringComparison.OrdinalIgnoreCase),
            CatalogQueryTextTarget.NameOrPath => item.Name.Contains(term, StringComparison.OrdinalIgnoreCase) || path.Contains(term, StringComparison.OrdinalIgnoreCase),
            _ => item.Name.Contains(term, StringComparison.OrdinalIgnoreCase) || path.Contains(term, StringComparison.OrdinalIgnoreCase) || keywords.Contains(term, StringComparison.OrdinalIgnoreCase)
        });
    }
}
