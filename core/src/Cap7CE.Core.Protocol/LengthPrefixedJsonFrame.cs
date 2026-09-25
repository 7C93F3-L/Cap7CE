using System.Buffers.Binary;
using System.Text.Json;

namespace Cap7CE.Core.Protocol;

public static class LengthPrefixedJsonFrame
{
    private const int HeaderBytes = sizeof(int);

    public static async ValueTask<T?> ReadAsync<T>(Stream stream, CancellationToken cancellationToken)
        where T : class
    {
        var header = new byte[HeaderBytes];
        var firstRead = await stream.ReadAsync(header.AsMemory(0, HeaderBytes), cancellationToken);
        if (firstRead == 0)
        {
            return null;
        }
        await ReadRemainingAsync(stream, header.AsMemory(firstRead), cancellationToken);

        var payloadLength = BinaryPrimitives.ReadInt32LittleEndian(header);
        if (payloadLength <= 0)
        {
            throw new CoreProtocolException(CoreErrorCodes.InvalidFrame, "Frame length must be positive.");
        }
        if (payloadLength > CoreProtocol.MaximumFrameBytes)
        {
            throw new CoreProtocolException(CoreErrorCodes.MessageTooLarge, "Frame exceeds the protocol limit.");
        }

        var payload = GC.AllocateUninitializedArray<byte>(payloadLength);
        await ReadRemainingAsync(stream, payload, cancellationToken);
        try
        {
            return JsonSerializer.Deserialize<T>(payload, CoreProtocolJson.Options)
                ?? throw new CoreProtocolException(CoreErrorCodes.InvalidFrame, "Frame payload is empty.");
        }
        catch (JsonException error)
        {
            throw new CoreProtocolException(CoreErrorCodes.InvalidFrame, "Frame payload is not valid protocol JSON.", error);
        }
    }

    public static async ValueTask WriteAsync<T>(Stream stream, T value, CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.SerializeToUtf8Bytes(value, CoreProtocolJson.Options);
        if (payload.Length <= 0 || payload.Length > CoreProtocol.MaximumFrameBytes)
        {
            throw new CoreProtocolException(CoreErrorCodes.MessageTooLarge, "Serialized frame exceeds the protocol limit.");
        }

        var header = new byte[HeaderBytes];
        BinaryPrimitives.WriteInt32LittleEndian(header, payload.Length);
        await stream.WriteAsync(header, cancellationToken);
        await stream.WriteAsync(payload, cancellationToken);
        await stream.FlushAsync(cancellationToken);
    }

    private static async ValueTask ReadRemainingAsync(
        Stream stream,
        Memory<byte> destination,
        CancellationToken cancellationToken)
    {
        while (!destination.IsEmpty)
        {
            var bytesRead = await stream.ReadAsync(destination, cancellationToken);
            if (bytesRead == 0)
            {
                throw new CoreProtocolException(CoreErrorCodes.InvalidFrame, "Frame ended before the declared length.");
            }
            destination = destination[bytesRead..];
        }
    }
}
