using Cap7CE.Core.Host;
using Cap7CE.Core.Host.CatalogMaintenance;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Tests;

internal static class CatalogJournalAdvanceTests
{
    public static async Task RunAsync()
    {
        var cursor = new CatalogJournalAdvanceCursor(42, 100);
        static ReaderJournalRecordV2 Record(long usn, bool own) => new(own ? 1u : 2u, 3, 1, usn, 32, false, true,
            own ? "own.db-wal" : "user.png", own ? ".db-wal" : ".png", 10, 1, 1);
        static CatalogReaderJournalPage Page(long next, params ReaderJournalRecordV2[] records) => new(true, new(42, 0, 0, next, true, records));
        var writes = 0;
        for (var index = 0; index < 100; index++) {
            var batch = cursor.Prepare(Page(101 + index, Record(100 + index, true)), record => record.FileReference == 1);
            if (batch.RequiresCatalogWrite) writes++;
            cursor.CompleteVolatile(batch);
        }
        TestAssert.Equal(0, writes, "repeated own journal writes cannot generate a Catalog/WAL feedback write");
        TestAssert.Equal(100L, cursor.PersistedUsn, "own-only advancement does not modify the durable checkpoint");
        TestAssert.Equal(200L, cursor.NextReadUsn, "own-only pages still advance the next native read");
        var external = cursor.Prepare(Page(202, Record(200, true), Record(201, false) with { Name = "own.db-wal" }), record => record.FileReference == 1);
        TestAssert.Equal(1, external.Records.Count, "mixed page retains only external changes");
        TestAssert.Equal(100L, external.PersistedUsn, "external batch commits across ignored own prefix");
        await TestAssert.ThrowsAsync<InvalidOperationException>(() => Task.Run(() => cursor.CompleteVolatile(external)),
            "external changes cannot be advanced without a Catalog commit");
        TestAssert.Equal(200L, cursor.NextReadUsn, "failed commit leaves native cursor available for retry");
        await TestAssert.ThrowsAsync<InvalidOperationException>(() => Task.Run(() => cursor.CompletePersisted(external, 201)),
            "wrong committed checkpoint cannot advance cursor");
        cursor.CompletePersisted(external, 202); writes++;
        TestAssert.Equal(202L, cursor.PersistedUsn, "external changes advance durable checkpoint only after matching commit");
        var restarted = new CatalogJournalAdvanceCursor(42, 100);
        var replay = restarted.Prepare(Page(200, Record(100, true), Record(199, true)), record => record.FileReference == 1);
        restarted.CompleteVolatile(replay);
        TestAssert.Equal(200L, restarted.NextReadUsn, "restart safely replays ignored own prefix");
        var ownTail = cursor.Prepare(Page(203, Record(202, true)), _ => true);
        await TestAssert.ThrowsAsync<InvalidOperationException>(() => Task.Run(() => cursor.CompletePersisted(ownTail, 203)),
            "owned-only pages explicitly reject unnecessary checkpoint writes");
        cursor.CompleteVolatile(ownTail);
        await TestAssert.ThrowsAsync<InvalidOperationException>(() => Task.Run(() => cursor.CompleteVolatile(ownTail)), "old batch cannot advance twice");
        await TestAssert.ThrowsAsync<CatalogReaderDiscontinuityException>(() => Task.Run(() => cursor.Prepare(
            new(true, new(99, 0, 0, 204, true, [])), _ => true)), "journal generation change requires continuity recovery");
        await TestAssert.ThrowsAsync<CatalogReaderDiscontinuityException>(() => Task.Run(() => cursor.Prepare(
            new(true, new(42, 204, 204, 205, true, [])), _ => true)), "journal truncation behind volatile cursor requires recovery");
        await TestAssert.ThrowsAsync<InvalidDataException>(() => Task.Run(() => cursor.Prepare(Page(204, Record(205, false)), _ => false)),
            "out-of-page event cannot advance checkpoint");
        TestAssert.Equal(203L, cursor.NextReadUsn, "invalid page never advances cursor");
        TestAssert.Equal(1, writes, "only the external batch needs a write");
    }
}
