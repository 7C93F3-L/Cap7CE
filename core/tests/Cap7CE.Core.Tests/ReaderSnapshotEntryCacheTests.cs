using Cap7CE.Core.Reader.Host;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Tests;

internal static class ReaderSnapshotEntryCacheTests
{
    public static void Run()
    {
        var cache = new ReaderSnapshotEntryCache();
        var record = new ReaderMftRecord(11, 5, 10, 2, 32, false, "sample.png", ".png");
        var facts = new ReaderBasicFacts(10, 1, 2, 32, 1);
        cache.Add(record, facts);
        TestAssert.Equal("sample.png", cache.Read(11)!.Names.Single().Name, "single-link snapshot reuses the MFT name and same attribute read");
        cache.Clear(); TestAssert.True(cache.Read(11) is null, "snapshot boundary discards metadata cache");
        cache.Add(record, facts with { NumberOfLinks = 2 });
        TestAssert.True(cache.Read(11) is null, "multiple links always require the native complete-name query");
        cache.Add(record, facts with { Attributes = 0x400 });
        cache.Add(record, null);
        TestAssert.True(cache.Read(11) is null, "blocked or unavailable metadata never enters the fast path");
        for (var index = 1; index <= ReaderProtocol.MaximumRecordsPerPage; index++) cache.Add(record with { FileReference = (ulong)index }, facts);
        try { cache.Add(record with { FileReference = 5000 }, facts); throw new Exception("cache accepted an oversized page"); }
        catch (InvalidDataException) { }
        cache.Clear(); TestAssert.True(cache.Read(1) is null, "cache never accumulates earlier pages");
    }
}
