using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.Queries;
using Cap7CE.Core.Host.CatalogMaintenance;
using Cap7CE.Core.Reader.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogOwnedDirectoryTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-owned-ancestry-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); var path = Path.Combine(root, "fixture.db");
        static string Ref(ulong id) => id.ToString("X16");
        static ReaderJournalRecordV2 Record(ulong id, ulong parent, bool directory, long usn = 100, bool exists = true) =>
            new(id, parent, 0x2000, usn, directory ? 16u : 32u, directory, exists, "Cap7CE", "", 0, 1, 1);
        try {
            var catalog = new CatalogV2Database(path); await catalog.InitializeAsync();
            await ExecuteAsync(path, """
                INSERT INTO catalog_volumes_v2 VALUES('a','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                INSERT INTO catalog_volumes_v2 VALUES('b','Y:','NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000001',NULL,'owned','',1,16,1,0,1,1);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000002','0000000000000001','nested','',1,16,1,0,1,1);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000003','0000000000000002','nested2','',1,16,1,0,1,1);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000004',NULL,'outside','',1,16,1,0,1,1);
                INSERT INTO catalog_nodes_v2 VALUES('a','000000000000000B','0000000000000002','own','',0,32,1,0,1,1);
                INSERT INTO catalog_nodes_v2 VALUES('a','000000000000000C','0000000000000004','personal','',0,32,1,0,1,1);
                INSERT INTO catalog_nodes_v2 VALUES('b','0000000000000001',NULL,'other-volume','',1,16,1,0,1,1);
                """);
            var lookup = new CatalogStorageDirectoryReader(catalog);
            var first = await lookup.ReadOwnedPageAsync("a", [Ref(1)], 0, pageSize: 1);
            var links = new List<CatalogStorageDirectoryLink>(first.Directories); var after = first.Next;
            while (after is not null) { var page = await lookup.ReadOwnedPageAsync("a", [Ref(1)], 0, after, 1); links.AddRange(page.Directories); after = page.Next; }
            TestAssert.Equal(3, links.Count, "owned ancestry lookup pages only its directory subtree on one volume");
            TestAssert.Equal(3, links.Select(link => link.FileReference).Distinct().Count(), "owned directory keysets have no duplicates");
            var previous = await lookup.ReadParentsAsync("a", [Ref(11), Ref(12), Ref(99)], 0);
            TestAssert.Equal(2, previous.Count, "bounded parent lookup omits unknown identities");
            var index = new CatalogOwnedDirectoryIndex([Ref(1)], links);
            var partition = index.Partition([Record(11, 2, false), Record(12, 4, false)], previous);
            TestAssert.Equal(12ul, partition.ExternalRecords.Single().FileReference, "same name is not ownership evidence for a personal file");
            var created = index.Partition([Record(5, 2, true), Record(21, 5, false, 101)], new Dictionary<string, CatalogStorageParent>());
            TestAssert.Equal(0, created.ExternalRecords.Count, "new own folder propagates ownership to following child events");
            TestAssert.Equal(5ul, created.OwnedDirectoryRecords.Single().FileReference, "own folder identity is retained for later checkpoint publication");
            var movedIn = index.Partition([Record(12, 2, false)], previous);
            TestAssert.Equal(12ul, movedIn.ExternalRecords.Single().FileReference, "moving a previously external file in must update the Catalog path");
            var createdThenMoved = index.Partition([Record(22, 4, false), Record(22, 2, false, 101)], new Dictionary<string, CatalogStorageParent>());
            TestAssert.Equal(2, createdThenMoved.ExternalRecords.Count, "new external file moved in in one page retains its final location");
            var previousDirectories = await lookup.ReadParentsAsync("a", [Ref(2), Ref(3)], 0);
            var movedOut = index.Partition([Record(2, 4, true)], previousDirectories);
            TestAssert.True(movedOut.DirectoryMovedOutside, "owned directory moved out requests a completeness repair");
            TestAssert.Equal(1, movedOut.ExternalRecords.Count, "moved-out directory update is retained");
            var childOutside = index.Partition([Record(31, 3, false)], new Dictionary<string, CatalogStorageParent>());
            TestAssert.Equal(1, childOutside.ExternalRecords.Count, "descendant ownership follows ancestor relocation out");
            var replayMove = index.Partition([Record(2, 4, true)], previousDirectories);
            TestAssert.True(replayMove.DirectoryMovedOutside, "failed Catalog publication replay does not lose completeness repair");
            var deleting = new CatalogOwnedDirectoryIndex([Ref(1)], links);
            TestAssert.Equal(0, deleting.Partition([Record(2, 1, true, exists: false), Record(11, 2, false, 101, false)], previousDirectories).ExternalRecords.Count,
                "own directory deletion retains ancestry long enough to classify child deletions");
            var noRoots = new CatalogOwnedDirectoryIndex([], []);
            TestAssert.Equal(1, noRoots.Partition([Record(11, 2, false)], previous).ExternalRecords.Count, "volumes without owned roots retain all changes");
            await ExecuteAsync(path, "UPDATE catalog_state_v2 SET catalog_revision=1;");
            await TestAssert.ThrowsAsync<CatalogConcurrencyException>(() => lookup.ReadOwnedPageAsync("a", [Ref(1)], 0, first.Next, 1),
                "ancestry paging cannot mix Catalog revisions");
            await TestAssert.ThrowsAsync<CatalogConcurrencyException>(() => lookup.ReadParentsAsync("a", [Ref(11)], 0), "parent lookup rejects a stale Catalog revision");
            await TestAssert.ThrowsAsync<ArgumentException>(() => lookup.ReadParentsAsync("a", Enumerable.Repeat(Ref(11), 4097).ToArray(), 1), "parent lookup cannot exceed a journal page");
            await using (var connection = new SqliteConnection("Data Source=" + path)) {
                await connection.OpenAsync(); using var command = connection.CreateCommand(); command.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE name='file_fact_state';";
                TestAssert.Equal(0L, Convert.ToInt64(await command.ExecuteScalarAsync()), "owned ancestry lookup never activates metadata facts");
            }
            var cyclic = new CatalogOwnedDirectoryIndex([Ref(1)], [new(Ref(2), Ref(3)), new(Ref(3), Ref(2))]);
            await TestAssert.ThrowsAsync<InvalidDataException>(() => Task.Run(() => cyclic.Partition([Record(31, 2, false)], previous)),
                "corrupt ancestry fails closed instead of incorrectly suppressing a personal event");
            await ExecuteAsync(path, """
                WITH RECURSIVE numbers(n) AS (VALUES(1001) UNION ALL SELECT n+1 FROM numbers WHERE n<66537)
                INSERT INTO catalog_nodes_v2 SELECT 'a',printf('%016X',n),'0000000000000001','fixture-'||n,'',1,16,1,0,1,1 FROM numbers;
                """);
            await TestAssert.ThrowsAsync<InvalidDataException>(() => lookup.ReadOwnedPageAsync("a", [Ref(1)], 1),
                "owned ancestry rejects more than 65536 directories before constructing an unbounded cache");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
    private static async Task ExecuteAsync(string path, string sql) {
        await using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; await command.ExecuteNonQueryAsync();
    }
}
