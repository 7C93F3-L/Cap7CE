using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Host;

/// <summary>Consumes one bounded metadata batch; never publishes partial results.</summary>
public static class ReaderFileEntryClient
{
    public static async Task<IReadOnlyList<ReaderFileEntrySet>> ReadAsync(ReaderOpaqueId volume,
        IReadOnlyList<ulong> references,
        Func<ReaderFileEntryBatchRequest, CancellationToken, Task<ReaderFrame>> exchange, CancellationToken token)
    {
        var requested = references.ToArray();
        _ = ReaderPayloadCodec.EncodeFileEntryBatchRequest(new(volume, requested));
        var files = new List<ReaderFileEntrySet>(requested.Length); var index = 0u;
        while (index < requested.Length) {
            token.ThrowIfCancellationRequested();
            var frame = await exchange(new(volume, requested, index), token);
            if (frame.Header.MajorVersion != ReaderProtocol.CurrentMajorVersion
                || frame.Header.Operation != ReaderOperation.FileEntryNames || frame.Header.Kind != ReaderMessageKind.Response
                || frame.Header.PayloadLength != frame.Payload.Length || frame.Header.Status != ReaderStatus.Success
                || frame.Header.Flags is not (ReaderFrameFlags.MoreData or ReaderFrameFlags.EndOfStream))
                throw new ReaderProtocolException("unexpected-entry-response");
            var page = ReaderPayloadCodec.DecodeFileEntryBatchResponse(frame.Payload.Span);
            if (page.NextIndex != index + page.Files.Count || page.NextIndex > requested.Length
                || page.EndOfBatch != (page.NextIndex == requested.Length)
                || page.EndOfBatch != (frame.Header.Flags == ReaderFrameFlags.EndOfStream))
                throw new ReaderProtocolException("unexpected-entry-progress");
            for (var n = 0; n < page.Files.Count; n++)
                if (page.Files[n].FileReference != requested[checked((int)index + n)])
                    throw new ReaderProtocolException("unrequested-entry-reference");
            files.AddRange(page.Files); index = page.NextIndex;
        }
        token.ThrowIfCancellationRequested();
        return files.AsReadOnly();
    }
}

internal sealed partial class ReaderV2CatalogSession
{
    public Task<IReadOnlyList<ReaderFileEntrySet>> ReadFileEntriesAsync(CatalogReaderVolume volume,
        IReadOnlyList<ulong> references, CancellationToken token)
    {
        if (!SupportsFileEntryNames) throw new NotSupportedException("reader-entry-names-unavailable");
        return ReaderFileEntryClient.ReadAsync(volume.ReaderId, references,
            (request, cancellation) => ExchangeAsync(ReaderOperation.FileEntryNames,
                ReaderPayloadCodec.EncodeFileEntryBatchRequest(request), cancellation), token);
    }
}
