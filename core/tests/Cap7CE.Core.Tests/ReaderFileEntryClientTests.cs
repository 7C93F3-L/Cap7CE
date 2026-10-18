using Cap7CE.Core.Host;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Tests;

internal static class ReaderFileEntryClientTests
{
    public static async Task RunAsync()
    {
        var volume = new ReaderOpaqueId(1, 2);
        ReaderFileEntrySet Missing(ulong reference) => new(reference, ReaderFileEntryState.Missing, 0, null, null, null, []);
        ReaderFrame Page(ReaderFileEntryBatchRequest request, ReaderFileEntryBatchResponse response) =>
            ReaderFrame.ResponseFor(ReaderFrame.RequestV2(ReaderOperation.FileEntryNames, 1,
                ReaderPayloadCodec.EncodeFileEntryBatchRequest(request)), ReaderStatus.Success,
                response.EndOfBatch ? ReaderFrameFlags.EndOfStream : ReaderFrameFlags.MoreData,
                ReaderPayloadCodec.EncodeFileEntryBatchResponse(response));
        var calls = 0;
        var results = await ReaderFileEntryClient.ReadAsync(volume, [3, 4, 5], (request, token) => {
            TestAssert.Equal(volume, request.VolumeId, "entry batch uses requested opaque volume");
            TestAssert.Equal((uint)calls++, request.StartIndex, "entry continuation makes monotonic progress");
            return Task.FromResult(Page(request, new(request.StartIndex + 1, request.StartIndex == 2,
                [Missing(request.FileReferences[(int)request.StartIndex])])));
        }, CancellationToken.None);
        TestAssert.Equal(3, calls, "bounded response pages are consumed");
        TestAssert.True(results.Select(file => file.FileReference).SequenceEqual(new ulong[] { 3, 4, 5 }), "results preserve requested identities");
        foreach (var invalid in new[] {
            new ReaderFileEntryBatchResponse(1, true, [Missing(3)]),
            new ReaderFileEntryBatchResponse(2, true, [Missing(3)]),
            new ReaderFileEntryBatchResponse(2, true, [Missing(4), Missing(3)]),
            new ReaderFileEntryBatchResponse(2, true, [Missing(3), Missing(8)]) })
            await TestAssert.ThrowsAsync<ReaderProtocolException>(() => ReaderFileEntryClient.ReadAsync(volume, [3, 4],
                (request, token) => Task.FromResult(Page(request, invalid)), CancellationToken.None), "bad progress or identities cannot publish partial results");
        foreach (var invalidFlag in new[] { ReaderFrameFlags.None, ReaderFrameFlags.MoreData })
            await TestAssert.ThrowsAsync<ReaderProtocolException>(() => ReaderFileEntryClient.ReadAsync(volume, [3], (request, token) => {
                var frame = Page(request, new(1, true, [Missing(3)]));
                return Task.FromResult(frame with { Header = frame.Header with { Flags = invalidFlag } });
            }, CancellationToken.None), "envelope must match payload completion");
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        await TestAssert.ThrowsAsync<OperationCanceledException>(() => ReaderFileEntryClient.ReadAsync(volume, [3],
            (request, token) => throw new InvalidOperationException("must not exchange"), cancelled.Token), "cancelled batch performs no metadata reads");
        calls = 0;
        await TestAssert.ThrowsAsync<IOException>(() => ReaderFileEntryClient.ReadAsync(volume, [3, 4], (request, token) => {
            if (calls++ > 0) throw new IOException("disconnected");
            return Task.FromResult(Page(request, new(1, false, [Missing(3)])));
        }, CancellationToken.None), "disconnect after first page returns no partial result");
        ICatalogReaderSession legacy = new LegacySession();
        TestAssert.False(legacy.SupportsFileEntryNames, "older Reader sessions do not implicitly enable entry names");
        await TestAssert.ThrowsAsync<NotSupportedException>(() => legacy.ReadFileEntriesAsync(new(volume, "v", "V:", true), [3], CancellationToken.None), "old capability must fail explicitly");
    }

    private sealed class LegacySession : ICatalogReaderSession
    {
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
        public Task<IReadOnlyList<CatalogReaderVolume>> ListVolumesAsync(CancellationToken token) => throw new NotImplementedException();
        public Task<CatalogReaderInspection> InspectAsync(CatalogReaderVolume volume, CancellationToken token) => throw new NotImplementedException();
        public Task<CatalogReaderSnapshot> OpenSnapshotAsync(CatalogReaderVolume volume, CancellationToken token) => throw new NotImplementedException();
        public Task<CatalogReaderSnapshotPage> ReadSnapshotPageAsync(ReaderOpaqueId id, ulong cursor, uint limit, CancellationToken token) => throw new NotImplementedException();
        public Task CloseSnapshotAsync(ReaderOpaqueId id, CancellationToken token) => throw new NotImplementedException();
        public Task<CatalogReaderJournalPage> ReadJournalPageAsync(CatalogReaderVolume volume, ulong journal, long usn, uint limit, CancellationToken token) => throw new NotImplementedException();
    }
}
