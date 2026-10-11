using Cap7CE.Core.Adapters;
using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Tests;

internal static class SearchCursorCodecTests
{
    public static async Task RunAsync()
    {
        VerifyExpiryAndCatalogRevision();
        VerifyLiveCursor();
        await VerifyMillionItemPagingAsync();
    }

    private static void VerifyExpiryAndCatalogRevision()
    {
        var time = new AdjustableTimeProvider(DateTimeOffset.Parse("2026-01-01T00:00:00Z"));
        var codec = new SearchCursorCodec(time);
        var cursor = codec.Create(
            "fixture",
            1,
            1,
            CoreSearchSorts.NameAscending,
            [SyntheticMetadataSearchSource.VolumeId],
            7);
        TestAssert.Equal(1L, codec.Read(cursor, 7).Offset, "cursor offset");
        TestAssert.ThrowsCode(CoreErrorCodes.InvalidCursor, () => codec.Read(cursor, 8), "catalog revision cursor");
        time.Advance(TimeSpan.FromMinutes(6));
        TestAssert.ThrowsCode(CoreErrorCodes.InvalidCursor, () => codec.Read(cursor, 7), "expired cursor");
    }

    private static async Task VerifyMillionItemPagingAsync()
    {
        const int itemCount = 1_000_000;
        var source = new SyntheticMetadataSearchSource(itemCount);
        long offset = 0;
        long count = 0;
        while (true)
        {
            var page = await source.ReadPageAsync(
                new MetadataSearchPageRequest(
                    "fixture",
                    offset,
                    CoreProtocol.MaximumPageSize,
                    CoreSearchSorts.NameAscending,
                    [SyntheticMetadataSearchSource.VolumeId]),
                CancellationToken.None);
            TestAssert.True(page.Items.Count <= CoreProtocol.MaximumPageSize, "million-item page size");
            foreach (var item in page.Items)
            {
                TestAssert.Equal($"synthetic-{count:D5}", item.Id, "million-item stable order");
                count++;
            }
            if (page.NextOffset is not long nextOffset) break;
            TestAssert.True(nextOffset > offset, "million-item cursor must advance");
            offset = nextOffset;
        }
        TestAssert.Equal((long)itemCount, count, "million-item constant-memory paging");
    }

    private static void VerifyLiveCursor()
    {
        var time = new AdjustableTimeProvider(DateTimeOffset.Parse("2026-01-01T00:00:00Z"));
        var codec = new ProductSearchCursorCodec(time);
        var strict = new ProductSearchCursorToken("fixture", 100, [], new("direct-children", "a", "root"),
            null, "any", new("last.txt", "a", "1"), 7);
        TestAssert.ThrowsCode(CoreErrorCodes.InvalidCursor, () => codec.Read(codec.Create(strict), 8), "strict cursor keeps revision gate");
        var live = codec.Create(strict with { Continuation = "live" });
        var read = codec.Read(live, 8);
        TestAssert.Equal("root", read.Scope.RootFileReference!, "live cursor retains signed directory scope");
        TestAssert.Equal("last.txt", read.After!.Name, "live continuation uses the last ordered key");
        TestAssert.ThrowsCode(CoreErrorCodes.InvalidCursor, () => codec.Read(live[..^3] + "BAD", 8), "live signature remains mandatory");
        TestAssert.ThrowsCode(CoreErrorCodes.InvalidCursor, () => codec.Read(codec.Create(strict with { Continuation = "unknown" }), 8), "unknown consistency rejected");
        time.Advance(TimeSpan.FromMinutes(6));
        TestAssert.ThrowsCode(CoreErrorCodes.InvalidCursor, () => codec.Read(live, 8), "live cursor still has a bounded lifetime");
    }

    private sealed class AdjustableTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;

        public void Advance(TimeSpan duration) => now = now.Add(duration);
    }
}
