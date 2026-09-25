namespace Cap7CE.Core.Reader.Protocol;

public readonly record struct ReaderFrameHeader(
    ushort MajorVersion,
    ushort MinorVersion,
    ReaderMessageKind Kind,
    ReaderOperation Operation,
    ReaderFrameFlags Flags,
    ulong RequestId,
    uint PayloadLength,
    ReaderStatus Status);

public sealed record ReaderFrame(ReaderFrameHeader Header, ReadOnlyMemory<byte> Payload)
{
    public static ReaderFrame Request(
        ReaderOperation operation,
        ulong requestId,
        ReadOnlyMemory<byte> payload) =>
        new(new ReaderFrameHeader(
            ReaderProtocol.LegacyMajorVersion,
            ReaderProtocol.CurrentMinorVersion,
            ReaderMessageKind.Request,
            operation,
            ReaderFrameFlags.None,
            requestId,
            checked((uint)payload.Length),
            ReaderStatus.Success), payload);

    public static ReaderFrame RequestV2(
        ReaderOperation operation,
        ulong requestId,
        ReadOnlyMemory<byte> payload) =>
        new(new ReaderFrameHeader(
            ReaderProtocol.CurrentMajorVersion,
            ReaderProtocol.CurrentMinorVersion,
            ReaderMessageKind.Request,
            operation,
            ReaderFrameFlags.None,
            requestId,
            checked((uint)payload.Length),
            ReaderStatus.Success), payload);

    public static ReaderFrame Response(
        ReaderOperation operation,
        ulong requestId,
        ReaderStatus status,
        ReaderFrameFlags flags,
        ReadOnlyMemory<byte> payload) =>
        new(new ReaderFrameHeader(
            ReaderProtocol.LegacyMajorVersion,
            ReaderProtocol.CurrentMinorVersion,
            ReaderMessageKind.Response,
            operation,
            flags,
            requestId,
            checked((uint)payload.Length),
            status), payload);

    public static ReaderFrame ResponseFor(
        ReaderFrame request,
        ReaderStatus status,
        ReaderFrameFlags flags,
        ReadOnlyMemory<byte> payload) =>
        new(new ReaderFrameHeader(
            request.Header.MajorVersion,
            request.Header.MinorVersion,
            ReaderMessageKind.Response,
            request.Header.Operation,
            flags,
            request.Header.RequestId,
            checked((uint)payload.Length),
            status), payload);
}
