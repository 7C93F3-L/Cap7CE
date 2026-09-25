using System.Buffers.Binary;

namespace Cap7CE.Core.Reader.Protocol;

public static class ReaderFrameCodec
{
    private const ReaderFrameFlags AllFlags =
        ReaderFrameFlags.MoreData | ReaderFrameFlags.EndOfStream | ReaderFrameFlags.Retryable;

    public static byte[] Encode(ReaderFrame frame)
    {
        ArgumentNullException.ThrowIfNull(frame);
        Validate(frame.Header, frame.Payload.Length);
        var result = new byte[ReaderProtocol.HeaderBytes + frame.Payload.Length];
        WriteHeader(result, frame.Header);
        frame.Payload.Span.CopyTo(result.AsSpan(ReaderProtocol.HeaderBytes));
        return result;
    }

    public static ReaderFrame Decode(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length < ReaderProtocol.HeaderBytes) throw Failure("truncated-header");
        var header = ReadHeader(bytes[..ReaderProtocol.HeaderBytes]);
        Validate(header, bytes.Length - ReaderProtocol.HeaderBytes);
        return new ReaderFrame(header, bytes[ReaderProtocol.HeaderBytes..].ToArray());
    }

    public static async Task WriteAsync(
        Stream stream,
        ReaderFrame frame,
        CancellationToken cancellationToken)
    {
        var bytes = Encode(frame);
        await stream.WriteAsync(bytes, cancellationToken);
        await stream.FlushAsync(cancellationToken);
    }

    public static async Task<ReaderFrame> ReadAsync(
        Stream stream,
        CancellationToken cancellationToken)
    {
        var headerBytes = new byte[ReaderProtocol.HeaderBytes];
        await ReadExactlyAsync(stream, headerBytes, "truncated-header", cancellationToken);
        var header = ReadHeader(headerBytes);
        Validate(header, checked((int)header.PayloadLength));
        var payload = new byte[checked((int)header.PayloadLength)];
        await ReadExactlyAsync(stream, payload, "truncated-payload", cancellationToken);
        return new ReaderFrame(header, payload);
    }

    private static ReaderFrameHeader ReadHeader(ReadOnlySpan<byte> source)
    {
        if (BinaryPrimitives.ReadUInt32LittleEndian(source) != ReaderProtocol.Magic)
        {
            throw Failure("invalid-magic");
        }
        if (BinaryPrimitives.ReadUInt16LittleEndian(source[4..]) != ReaderProtocol.HeaderBytes)
        {
            throw Failure("invalid-header-size");
        }
        return new ReaderFrameHeader(
            BinaryPrimitives.ReadUInt16LittleEndian(source[6..]),
            BinaryPrimitives.ReadUInt16LittleEndian(source[8..]),
            (ReaderMessageKind)BinaryPrimitives.ReadUInt16LittleEndian(source[10..]),
            (ReaderOperation)BinaryPrimitives.ReadUInt16LittleEndian(source[12..]),
            (ReaderFrameFlags)BinaryPrimitives.ReadUInt16LittleEndian(source[14..]),
            BinaryPrimitives.ReadUInt64LittleEndian(source[16..]),
            BinaryPrimitives.ReadUInt32LittleEndian(source[24..]),
            (ReaderStatus)BinaryPrimitives.ReadUInt32LittleEndian(source[28..]));
    }

    private static void WriteHeader(Span<byte> target, ReaderFrameHeader header)
    {
        BinaryPrimitives.WriteUInt32LittleEndian(target, ReaderProtocol.Magic);
        BinaryPrimitives.WriteUInt16LittleEndian(target[4..], ReaderProtocol.HeaderBytes);
        BinaryPrimitives.WriteUInt16LittleEndian(target[6..], header.MajorVersion);
        BinaryPrimitives.WriteUInt16LittleEndian(target[8..], header.MinorVersion);
        BinaryPrimitives.WriteUInt16LittleEndian(target[10..], (ushort)header.Kind);
        BinaryPrimitives.WriteUInt16LittleEndian(target[12..], (ushort)header.Operation);
        BinaryPrimitives.WriteUInt16LittleEndian(target[14..], (ushort)header.Flags);
        BinaryPrimitives.WriteUInt64LittleEndian(target[16..], header.RequestId);
        BinaryPrimitives.WriteUInt32LittleEndian(target[24..], header.PayloadLength);
        BinaryPrimitives.WriteUInt32LittleEndian(target[28..], (uint)header.Status);
    }

    private static void Validate(ReaderFrameHeader header, int actualPayloadLength)
    {
        if (header.MajorVersion is not (ReaderProtocol.LegacyMajorVersion or ReaderProtocol.CurrentMajorVersion)
            || header.MinorVersion > ReaderProtocol.CurrentMinorVersion)
        {
            throw Failure("unsupported-version");
        }
        if (!Enum.IsDefined(header.Kind)) throw Failure("invalid-kind");
        if (!Enum.IsDefined(header.Operation)) throw Failure("invalid-operation");
        if (header.MajorVersion == ReaderProtocol.LegacyMajorVersion
            && header.Operation > ReaderOperation.Cancel)
        {
            throw Failure("operation-requires-cr2");
        }
        if (!Enum.IsDefined(header.Status)) throw Failure("invalid-status");
        if (header.RequestId == 0) throw Failure("invalid-request-id");
        if (header.PayloadLength > ReaderProtocol.MaximumPayloadBytes)
        {
            throw Failure("payload-too-large");
        }
        if (header.PayloadLength != actualPayloadLength) throw Failure("payload-length-mismatch");
        if ((header.Flags & ~AllFlags) != 0) throw Failure("invalid-flags");
        if (header.Flags.HasFlag(ReaderFrameFlags.MoreData)
            && header.Flags.HasFlag(ReaderFrameFlags.EndOfStream))
        {
            throw Failure("conflicting-stream-flags");
        }

        if (header.Kind == ReaderMessageKind.Request)
        {
            if (header.Status != ReaderStatus.Success || header.Flags != ReaderFrameFlags.None)
            {
                throw Failure("invalid-request-envelope");
            }
            return;
        }

        if (header.Status == ReaderStatus.Success)
        {
            if (header.Flags.HasFlag(ReaderFrameFlags.Retryable))
            {
                throw Failure("invalid-success-envelope");
            }
        }
        else if (header.PayloadLength != 0
                 || header.Flags.HasFlag(ReaderFrameFlags.MoreData)
                 || header.Flags.HasFlag(ReaderFrameFlags.EndOfStream))
        {
            throw Failure("invalid-error-envelope");
        }
    }

    private static async Task ReadExactlyAsync(
        Stream stream,
        Memory<byte> target,
        string errorCode,
        CancellationToken cancellationToken)
    {
        var read = 0;
        while (read < target.Length)
        {
            var count = await stream.ReadAsync(target[read..], cancellationToken);
            if (count == 0) throw Failure(errorCode);
            read += count;
        }
    }

    private static ReaderProtocolException Failure(string code) => new(code);
}
