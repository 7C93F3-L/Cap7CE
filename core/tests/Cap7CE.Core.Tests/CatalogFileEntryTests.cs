using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogFileEntryTests
{
    public static async Task RunAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        var catalog = new CatalogV2Database(fixture.DatabasePath); await catalog.InitializeAsync();
        await ExecuteAsync(fixture.DatabasePath, """
            INSERT INTO catalog_volumes_v2 VALUES('links','X:','NTFS',1,'1',1,0,0,'ready',3,3,0);
            INSERT INTO catalog_nodes_v2 VALUES
            ('links','0000000000000010',NULL,'one','',1,16,1,NULL,1,2),
            ('links','0000000000000011',NULL,'two','',1,16,1,NULL,1,2),
            ('links','0000000000000020','0000000000000010','original.png','.png',0,32,1,10,1,2);
            INSERT INTO catalog_manual_keywords VALUES('links','0000000000000020','1','["keep"]','keep',0);
            """);
        var identity = new CatalogEntryIdentity("links", "0000000000000020");
        var source = new CatalogFileEntrySource(1, 2, 10);
        CatalogFileName[] names = [new("0000000000000010", "original.png"), new("0000000000000011", "另一个名字.png")];
        var store = new CatalogFileEntryStore(catalog);
        TestAssert.True(await store.ReadAsync(identity) is null, "old catalog has no implicit entry extension");
        await TestAssert.ThrowsAsync<InvalidOperationException>(() => store.ReplaceAsync(identity, source, 0, names), "publication needs explicit activation");
        await store.InitializeAsync(); await store.InitializeAsync();
        TestAssert.Equal(0L, await catalog.ReadRevisionAsync(), "empty extension does not change result revision");
        TestAssert.True(await store.ReplaceAsync(identity, source, 0, names), "publish complete entry set");
        var first = (await store.ReadAsync(identity))!;
        TestAssert.Equal(2, first.Entries.Count, "one physical file retains both directory entries");
        TestAssert.Equal(2, first.Entries.Select(entry => entry.EntryKey).Distinct().Count(), "entry identity differs from physical identity");
        TestAssert.Equal(1L, await catalog.ReadRevisionAsync(), "one atomic publication has one revision");
        TestAssert.False(await store.ReplaceAsync(identity, source, 1, names.Reverse().ToArray()), "order-only repeat is silent");
        TestAssert.Equal(1L, await catalog.ReadRevisionAsync(), "idempotence does not invalidate pages");
        await TestAssert.ThrowsAsync<CatalogConcurrencyException>(() => store.ReplaceAsync(identity, source, 0, []), "stale volume cannot replace names");
        await TestAssert.ThrowsAsync<CatalogConcurrencyException>(() => store.ReplaceAsync(identity, source with { SizeBytes = 11 }, 1, []), "changed physical source cannot publish old names");
        await TestAssert.ThrowsAsync<CatalogConcurrencyException>(() => store.ReplaceAsync(identity, source, 1, [new("0000000000000099", "missing.png")]), "missing parent is not silently accepted");
        await TestAssert.ThrowsAsync<ArgumentException>(() => store.ReplaceAsync(identity, source, 1, [names[0], names[0]]), "duplicate entry rejected");
        foreach (var invalid in new[] { "..", ".", "bad/name", "bad\\name", "bad:stream", "bad\0name" })
            await TestAssert.ThrowsAsync<ArgumentException>(() => store.ReplaceAsync(identity, source, 1, [new("0000000000000010", invalid)]), "names cannot escape their parent");
        await TestAssert.ThrowsAsync<ArgumentException>(() => store.ReplaceAsync(identity, source, 1,
            Enumerable.Range(0, 1025).Select(index => new CatalogFileName("0000000000000010", index.ToString())).ToArray()), "bounded complete set");
        await ExecuteAsync(fixture.DatabasePath, """
            CREATE TRIGGER reject_entry BEFORE INSERT ON catalog_file_entries WHEN NEW.name='bad.png'
            BEGIN SELECT RAISE(ABORT,'entry-fixture-interruption'); END;
            """);
        await TestAssert.ThrowsAsync<SqliteException>(() => store.ReplaceAsync(identity, source, 1,
            [new("0000000000000010", "bad.png")]), "interrupted replacement fails as a transaction");
        var retained = (await store.ReadAsync(identity))!;
        TestAssert.True(first.Entries.SequenceEqual(retained.Entries), "failed replacement preserves previous complete set");
        TestAssert.Equal(1L, await catalog.ReadRevisionAsync(), "failed write preserves cursor revision");
        await ExecuteAsync(fixture.DatabasePath, "DROP TRIGGER reject_entry;");
        using (var cancellation = new CancellationTokenSource()) {
            cancellation.Cancel();
            await TestAssert.ThrowsAsync<OperationCanceledException>(() => store.ReplaceAsync(identity, source, 1, [], cancellation.Token), "cancelled publication does not erase names");
        }
        TestAssert.True(await store.ReplaceAsync(identity, source, 1, [names[1]]), "removing one link retains the other");
        TestAssert.Equal(first.Entries.Single(entry => entry.Name == names[1].Name).EntryKey,
            (await new CatalogFileEntryStore(new CatalogV2Database(fixture.DatabasePath)).ReadAsync(identity))!.Entries.Single().EntryKey, "remaining entry identity survives reopening and sibling removal");
        TestAssert.Equal("original.png", await ScalarAsync(fixture.DatabasePath, "SELECT name FROM catalog_nodes_v2 WHERE file_reference='0000000000000020';"), "entry names never overwrite canonical source ownership");
        TestAssert.Equal("keep", await ScalarAsync(fixture.DatabasePath, "SELECT search_text FROM catalog_manual_keywords;"), "shared annotation remains unchanged");
        await ExecuteAsync(fixture.DatabasePath, "UPDATE catalog_nodes_v2 SET created_utc_ticks=99 WHERE file_reference='0000000000000020';");
        TestAssert.True(await store.ReadAsync(identity) is null, "reused file identity never inherits old entry names");
        TestAssert.True(await store.ReplaceAsync(identity, source with { CreatedUtcTicks = 99 }, 2,
            [new("0000000000000010", "Case.png"), new("0000000000000010", "case.png")]), "entry keys preserve exact names in case-sensitive directories");
        TestAssert.Equal(2, (await store.ReadAsync(identity))!.Entries.Count, "case-distinct entries remain distinct");
        TestAssert.True(await store.ReplaceAsync(identity, source with { CreatedUtcTicks = 99 }, 3, []), "empty complete set differs from no observation");
        TestAssert.Equal(0, (await store.ReadAsync(identity))!.Entries.Count, "empty set is persisted, not mistaken for legacy fallback");
        await ExecuteAsync(fixture.DatabasePath, "PRAGMA foreign_keys=ON; DELETE FROM catalog_nodes_v2 WHERE file_reference='0000000000000020';");
        TestAssert.Equal("0", await ScalarAsync(fixture.DatabasePath, "SELECT COUNT(*) FROM catalog_file_entry_sets;"), "physical deletion retires entry ownership");
        TestAssert.Equal("0", await ScalarAsync(fixture.DatabasePath, "SELECT COUNT(*) FROM catalog_file_entries;"), "entry rows have no orphans");
        TestAssert.Equal("keep", await ScalarAsync(fixture.DatabasePath, "SELECT search_text FROM catalog_manual_keywords;"), "replaceable entry cleanup does not delete annotations");
    }

    private static async Task ExecuteAsync(string databasePath, string sql)
    {
        await using var connection = new SqliteConnection($"Data Source={databasePath};Pooling=False");
        await connection.OpenAsync(); using var command = connection.CreateCommand(); command.CommandText = sql;
        await command.ExecuteNonQueryAsync();
    }
    private static async Task<string> ScalarAsync(string databasePath, string sql)
    {
        await using var connection = new SqliteConnection($"Data Source={databasePath};Mode=ReadOnly;Pooling=False");
        await connection.OpenAsync(); using var command = connection.CreateCommand(); command.CommandText = sql;
        return Convert.ToString(await command.ExecuteScalarAsync())!;
    }
}
