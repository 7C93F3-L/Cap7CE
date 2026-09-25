using Cap7CE.Core.Adapters;
using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Tests;

internal static class SearchCursorCodecTests
{
    public static async Task RunAsync()
    {
        VerifyExpiryAndCatalogRevision();
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

    private sealed class AdjustableTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;

        public void Advance(TimeSpan duration) => now = now.Add(duration);
    }
}
