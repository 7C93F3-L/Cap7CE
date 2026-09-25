using System.Security.Cryptography;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Host;

internal sealed record ReaderFixtureSessionReport(
    ReaderServiceIdentityResult ServiceIdentity,
    bool ExcessiveRightsDenied,
    bool RemoteClientsRejected,
    int Pages,
    int Records,
    int JournalRecords);

internal static class ReaderServiceClient
{
    public static Task<ReaderFixtureSessionReport> RunFixtureAsync(CancellationToken cancellationToken) =>
        RunFixtureAsync(ReaderClientConstants.Legacy, cancellationToken);

    public static async Task<ReaderFixtureSessionReport> RunFixtureAsync(
        ReaderServiceEndpoint endpoint,
        CancellationToken cancellationToken)
    {
        using var connection = await ReaderNativeClient.ConnectAsync(endpoint, cancellationToken);
        var serviceIdentity = ReaderServiceIdentity.Verify(endpoint, connection.ServerProcessId);
        if (!serviceIdentity.Passed) throw new UnauthorizedAccessException(serviceIdentity.Stage);
        var stream = connection.Stream;
        ulong requestId = 1;
        var nonce = RandomNumberGenerator.GetBytes(ReaderProtocol.HelloNonceBytes);
        var helloResponse = await ExchangeAsync(stream,
            ReaderOperation.Hello,
            requestId++,
            ReaderPayloadCodec.EncodeHelloRequest(new ReaderHelloRequest(
                nonce, checked((uint)Environment.ProcessId))),
            ReaderFrameFlags.None,
            cancellationToken);
        var hello = ReaderPayloadCodec.DecodeHelloResponse(helloResponse.Payload.Span);
        if (!nonce.SequenceEqual(hello.Nonce)
            || hello.ServerProcessId != connection.ServerProcessId
            || !hello.Capabilities.HasFlag(ReaderCapabilities.SyntheticFixture))
        {
            throw new UnauthorizedAccessException("reader-hello-mismatch");
        }

        var statusFrame = await ExchangeAsync(stream, ReaderOperation.Status, requestId++, ReadOnlyMemory<byte>.Empty,
            ReaderFrameFlags.None, cancellationToken);
        var status = ReaderPayloadCodec.DecodeStatusResponse(statusFrame.Payload.Span);
        if (!status.Ready || !status.FixtureOnly || !status.RemoteClientsRejected || !status.ClientAuthenticated)
        {
            throw new InvalidDataException("reader-status-boundary");
        }

        var inspectFrame = await ExchangeAsync(stream, ReaderOperation.VolumeInspect, requestId++,
            ReaderPayloadCodec.EncodeVolumeInspectRequest(new ReaderVolumeInspectRequest(status.PrimaryVolumeId)),
            ReaderFrameFlags.None, cancellationToken);
        var inspect = ReaderPayloadCodec.DecodeVolumeInspectResponse(inspectFrame.Payload.Span);
        if (!inspect.Supported || !inspect.JournalAvailable || inspect.RecordCount != 3)
        {
            throw new InvalidDataException("reader-volume-inspect");
        }

        var openFrame = await ExchangeAsync(stream, ReaderOperation.MftOpenSnapshot, requestId++,
            ReaderPayloadCodec.EncodeMftOpenSnapshotRequest(new ReaderMftOpenSnapshotRequest(status.PrimaryVolumeId)),
            ReaderFrameFlags.None, cancellationToken);
        var open = ReaderPayloadCodec.DecodeMftOpenSnapshotResponse(openFrame.Payload.Span);
        if (open.RecordCount != inspect.RecordCount) throw new InvalidDataException("reader-snapshot-count");

        var records = new List<ReaderMftRecord>();
        var cursor = 0UL;
        var pages = 0;
        while (pages < ReaderProtocol.MaximumRequestedPages)
        {
            var pageFrame = await ExchangeAsync(stream, ReaderOperation.MftReadPage, requestId++,
                ReaderPayloadCodec.EncodeMftReadPageRequest(new ReaderMftReadPageRequest(
                    open.SnapshotId, cursor, 2)),
                pages == 0 ? ReaderFrameFlags.MoreData : ReaderFrameFlags.EndOfStream,
                cancellationToken);
            var page = ReaderPayloadCodec.DecodeMftReadPageResponse(pageFrame.Payload.Span);
            records.AddRange(page.Records);
            pages++;
            if (page.EndOfStream) break;
            if (page.NextCursor <= cursor) throw new InvalidDataException("reader-cursor-stalled");
            cursor = page.NextCursor;
        }
        if (pages != 2
            || records.Select(record => record.Name).ToArray()
                is not ["fixture-01.png", "fixture-02.psd", "fixture-folder"])
        {
            throw new InvalidDataException("reader-fixture-records");
        }

        _ = await ExchangeAsync(stream, ReaderOperation.MftCloseSnapshot, requestId++,
            ReaderPayloadCodec.EncodeMftCloseSnapshotRequest(new ReaderMftCloseSnapshotRequest(open.SnapshotId)),
            ReaderFrameFlags.None, cancellationToken);

        var journalFrame = await ExchangeAsync(stream, ReaderOperation.JournalReadBatch, requestId,
            ReaderPayloadCodec.EncodeJournalReadBatchRequest(new ReaderJournalReadBatchRequest(
                status.PrimaryVolumeId, inspect.JournalId, 100, 16)),
            ReaderFrameFlags.EndOfStream,
            cancellationToken);
        var journal = ReaderPayloadCodec.DecodeJournalReadBatchResponse(journalFrame.Payload.Span);
        if (!journal.Continuous || journal.NextUsn != 101 || journal.Records.Count != 1)
        {
            throw new InvalidDataException("reader-journal-fixture");
        }
        return new(serviceIdentity, connection.ExcessiveRightsDenied,
            status.RemoteClientsRejected, pages, records.Count, journal.Records.Count);
    }

    public static async Task<ReaderServiceIdentityResult> ConnectAndDisconnectAsync(
        CancellationToken cancellationToken)
    {
        using var connection = await ReaderNativeClient.ConnectAsync(ReaderClientConstants.Legacy, cancellationToken);
        var identity = ReaderServiceIdentity.Verify(ReaderClientConstants.Legacy, connection.ServerProcessId);
        if (!identity.Passed) throw new UnauthorizedAccessException(identity.Stage);
        return identity;
    }

    private static async Task<ReaderFrame> ExchangeAsync(
        Stream stream,
        ReaderOperation operation,
        ulong requestId,
        ReadOnlyMemory<byte> payload,
        ReaderFrameFlags expectedFlags,
        CancellationToken cancellationToken)
    {
        await ReaderFrameCodec.WriteAsync(stream,
            ReaderFrame.Request(operation, requestId, payload), cancellationToken);
        var response = await ReaderFrameCodec.ReadAsync(stream, cancellationToken);
        if (response.Header.Kind != ReaderMessageKind.Response
            || response.Header.Operation != operation
            || response.Header.RequestId != requestId
            || response.Header.Status != ReaderStatus.Success
            || response.Header.Flags != expectedFlags)
        {
            throw new ReaderProtocolException("unexpected-reader-response");
        }
        return response;
    }
}
