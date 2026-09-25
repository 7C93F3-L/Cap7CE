using System.Security.Cryptography;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Host;

public sealed class ReaderV2CatalogSessionFactory : ICatalogReaderSessionFactory
{
    private const int MaximumConnectAttempts = 2;
    private static readonly TimeSpan[] ConnectDeadlines =
        [TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(15)];

    public async Task<ICatalogReaderSession> ConnectAsync(CancellationToken token)
    {
        for (var attempt = 0; attempt < MaximumConnectAttempts; attempt++)
        {
            _ = await ReaderServiceController.EnsureStartedAsync(ReaderClientConstants.Legacy, token);
            using var connectionDeadline = CancellationTokenSource.CreateLinkedTokenSource(token);
            connectionDeadline.CancelAfter(ConnectDeadlines[attempt]);
            ReaderPipeConnection connection;
            try
            {
                connection = await ReaderNativeClient.ConnectAsync(
                    ReaderClientConstants.Legacy,
                    connectionDeadline.Token);
            }
            catch (OperationCanceledException) when (!token.IsCancellationRequested && attempt + 1 < MaximumConnectAttempts)
            {
                continue;
            }
            catch (OperationCanceledException) when (!token.IsCancellationRequested)
            {
                throw new TimeoutException("reader-pipe-connect-timeout");
            }
            try
            {
                var identity = ReaderServiceIdentity.Verify(ReaderClientConstants.Legacy, connection.ServerProcessId);
                if (!identity.Passed) throw new UnauthorizedAccessException(identity.Stage);
                return await ReaderV2CatalogSession.ConnectAsync(connection, token);
            }
            catch
            {
                connection.Dispose();
                throw;
            }
        }
        throw new TimeoutException("reader-pipe-connect-timeout");
    }
}

internal sealed class ReaderV2CatalogSession : ICatalogReaderSession
{
    private readonly ReaderPipeConnection connection;
    private ulong requestId = 1;

    private ReaderV2CatalogSession(ReaderPipeConnection connection) => this.connection = connection;

    internal static async Task<ReaderV2CatalogSession> ConnectAsync(
        ReaderPipeConnection connection,
        CancellationToken token)
    {
        var session = new ReaderV2CatalogSession(connection);
        var nonce = RandomNumberGenerator.GetBytes(ReaderProtocol.HelloNonceBytes);
        var response = await session.ExchangeSuccessAsync(
            ReaderOperation.Hello,
            ReaderPayloadCodec.EncodeHelloRequest(new ReaderHelloRequest(
                nonce, checked((uint)Environment.ProcessId))),
            ReaderFrameFlags.None,
            token);
        var hello = ReaderPayloadCodec.DecodeHelloResponse(response.Payload.Span);
        if (!nonce.SequenceEqual(hello.Nonce)
            || hello.ServerProcessId != connection.ServerProcessId
            || !hello.Capabilities.HasFlag(ReaderCapabilities.SnapshotPaging)
            || !hello.Capabilities.HasFlag(ReaderCapabilities.JournalPaging)
            || !hello.Capabilities.HasFlag(ReaderCapabilities.MultiVolume)
            || !hello.Capabilities.HasFlag(ReaderCapabilities.BasicFacts))
        {
            throw new UnauthorizedAccessException("reader-cr2-hello");
        }
        return session;
    }

    public async Task<IReadOnlyList<CatalogReaderVolume>> ListVolumesAsync(CancellationToken token)
    {
        var response = await ExchangeSuccessAsync(
            ReaderOperation.VolumeEnumerate,
            ReadOnlyMemory<byte>.Empty,
            ReaderFrameFlags.None,
            token);
        return ReaderPayloadCodec.DecodeVolumeEnumerateResponse(response.Payload.Span).Volumes
            .Where(volume => volume.Fixed && volume.Ntfs)
            .Select(volume => new CatalogReaderVolume(
                volume.VolumeId,
                CatalogVolumeId(volume.VolumeId),
                volume.DisplayName,
                volume.JournalAvailable))
            .ToArray();
    }

    public async Task<CatalogReaderInspection> InspectAsync(
        CatalogReaderVolume volume,
        CancellationToken token)
    {
        var response = await ExchangeSuccessAsync(
            ReaderOperation.VolumeInspect,
            ReaderPayloadCodec.EncodeVolumeInspectRequest(new ReaderVolumeInspectRequest(volume.ReaderId)),
            ReaderFrameFlags.None,
            token);
        var value = ReaderPayloadCodec.DecodeVolumeInspectResponseV2(response.Payload.Span);
        if (!value.Supported || !value.JournalAvailable || value.VolumeId != volume.ReaderId)
        {
            throw new NotSupportedException("reader-volume-not-supported");
        }
        return new CatalogReaderInspection(
            value.RecordCount, value.JournalId, value.FirstUsn,
            value.LowestValidUsn, value.NextUsn);
    }

    public async Task<CatalogReaderSnapshot> OpenSnapshotAsync(
        CatalogReaderVolume volume,
        CancellationToken token)
    {
        var response = await ExchangeSuccessAsync(
            ReaderOperation.MftOpenSnapshot,
            ReaderPayloadCodec.EncodeMftOpenSnapshotRequest(new ReaderMftOpenSnapshotRequest(volume.ReaderId)),
            ReaderFrameFlags.None,
            token);
        var value = ReaderPayloadCodec.DecodeMftOpenSnapshotResponse(response.Payload.Span);
        return new CatalogReaderSnapshot(
            value.SnapshotId, value.RecordCount, value.JournalId, value.JournalStartingUsn);
    }

    public async Task<CatalogReaderSnapshotPage> ReadSnapshotPageAsync(
        ReaderOpaqueId snapshotId,
        ulong cursor,
        uint limit,
        CancellationToken token)
    {
        var response = await ExchangeAsync(
            ReaderOperation.MftReadPage,
            ReaderPayloadCodec.EncodeMftReadPageRequest(new ReaderMftReadPageRequest(snapshotId, cursor, limit)),
            token);
        if (response.Header.Status != ReaderStatus.Success
            || response.Header.Flags is not (ReaderFrameFlags.MoreData or ReaderFrameFlags.EndOfStream))
        {
            throw new ReaderProtocolException("unexpected-cr2-snapshot-page");
        }
        var value = ReaderPayloadCodec.DecodeMftReadPageResponseV2(response.Payload.Span);
        return new CatalogReaderSnapshotPage(value.NextCursor, value.EndOfStream, value.Records);
    }

    public async Task CloseSnapshotAsync(ReaderOpaqueId snapshotId, CancellationToken token) =>
        _ = await ExchangeSuccessAsync(
            ReaderOperation.MftCloseSnapshot,
            ReaderPayloadCodec.EncodeMftCloseSnapshotRequest(new ReaderMftCloseSnapshotRequest(snapshotId)),
            ReaderFrameFlags.None,
            token);

    public async Task<CatalogReaderJournalPage> ReadJournalPageAsync(
        CatalogReaderVolume volume,
        ulong journalId,
        long startingUsn,
        uint limit,
        CancellationToken token)
    {
        var response = await ExchangeAsync(
            ReaderOperation.JournalReadBatch,
            ReaderPayloadCodec.EncodeJournalReadBatchRequest(new ReaderJournalReadBatchRequest(
                volume.ReaderId, journalId, startingUsn, limit)),
            token);
        if (response.Header.Status == ReaderStatus.JournalDiscontinuous)
        {
            throw new CatalogReaderDiscontinuityException();
        }
        if (response.Header.Status != ReaderStatus.Success
            || response.Header.Flags is not (ReaderFrameFlags.MoreData or ReaderFrameFlags.EndOfStream))
        {
            throw new ReaderProtocolException("unexpected-cr2-journal-page");
        }
        return new CatalogReaderJournalPage(
            response.Header.Flags == ReaderFrameFlags.EndOfStream,
            ReaderPayloadCodec.DecodeJournalReadBatchResponseV2(response.Payload.Span));
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            if (requestId > 1)
            {
                _ = await ExchangeAsync(
                    ReaderOperation.Cancel,
                    ReaderPayloadCodec.EncodeCancelRequest(new ReaderCancelRequest(requestId - 1)),
                    CancellationToken.None);
            }
        }
        catch
        {
            // Disconnect is the bounded fallback when the Reader has already stopped.
        }
        connection.Dispose();
    }

    private async Task<ReaderFrame> ExchangeSuccessAsync(
        ReaderOperation operation,
        ReadOnlyMemory<byte> payload,
        ReaderFrameFlags flags,
        CancellationToken token)
    {
        var response = await ExchangeAsync(operation, payload, token);
        if (response.Header.Status != ReaderStatus.Success || response.Header.Flags != flags)
        {
            throw new ReaderProtocolException("unexpected-cr2-response");
        }
        return response;
    }

    private async Task<ReaderFrame> ExchangeAsync(
        ReaderOperation operation,
        ReadOnlyMemory<byte> payload,
        CancellationToken token)
    {
        var current = requestId++;
        await ReaderFrameCodec.WriteAsync(
            connection.Stream,
            ReaderFrame.RequestV2(operation, current, payload),
            token);
        var response = await ReaderFrameCodec.ReadAsync(connection.Stream, token);
        if (response.Header.MajorVersion != ReaderProtocol.CurrentMajorVersion
            || response.Header.Kind != ReaderMessageKind.Response
            || response.Header.Operation != operation
            || response.Header.RequestId != current)
        {
            throw new ReaderProtocolException("unexpected-cr2-response-envelope");
        }
        return response;
    }

    public static string CatalogVolumeId(ReaderOpaqueId id) => $"{id.First:X16}{id.Second:X16}";
}
