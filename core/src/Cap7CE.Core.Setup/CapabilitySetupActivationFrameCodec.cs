using System.Buffers.Binary;

namespace Cap7CE.Core.Setup;

internal static class CapabilitySetupActivationFrameCodec
{
    public static async ValueTask WriteAsync(
        Stream stream,
        ReadOnlyMemory<byte> payload,
        int maximumBytes,
        string invalidSizeReason,
        CancellationToken cancellationToken)
    {
        if (payload.Length is 0 || payload.Length > maximumBytes)
        {
            throw new InvalidDataException(invalidSizeReason);
        }
        var prefix = new byte[sizeof(int)];
        BinaryPrimitives.WriteInt32LittleEndian(prefix, payload.Length);
        await stream.WriteAsync(prefix, cancellationToken);
        await stream.WriteAsync(payload, cancellationToken);
        await stream.FlushAsync(cancellationToken);
    }

    public static async ValueTask<byte[]> ReadAsync(
        Stream stream,
        int maximumBytes,
        string invalidSizeReason,
        CancellationToken cancellationToken)
    {
        var prefix = new byte[sizeof(int)];
        await stream.ReadExactlyAsync(prefix, cancellationToken);
        var length = BinaryPrimitives.ReadInt32LittleEndian(prefix);
        if (length is <= 0 || length > maximumBytes)
        {
            throw new InvalidDataException(invalidSizeReason);
        }
        var payload = new byte[length];
        await stream.ReadExactlyAsync(payload, cancellationToken);
        return payload;
    }
}
