using System.Buffers.Binary;
using System.Text;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Tests;

internal static class ProtocolFrameTests
{
    public static async Task RunAsync()
    {
        await RoundTripsAsync();
        await RejectsInvalidLengthsAsync();
        await RejectsTruncatedPayloadAsync();
        await RejectsUnknownJsonMembersAsync();
        await RejectsOversizedWritesAsync();
    }

    private static async Task RoundTripsAsync()
    {
        await using var stream = new MemoryStream();
        await LengthPrefixedJsonFrame.WriteAsync(stream, new SearchCancelResponse(true), CancellationToken.None);
        stream.Position = 0;
        var result = await LengthPrefixedJsonFrame.ReadAsync<SearchCancelResponse>(stream, CancellationToken.None);
        TestAssert.True(result?.Accepted == true, "frame roundtrip");
    }

    private static async Task RejectsInvalidLengthsAsync()
    {
        foreach (var length in new[] { 0, -1 })
        {
            await using var stream = PrefixOnly(length);
            await TestAssert.ThrowsCodeAsync(CoreErrorCodes.InvalidFrame,
                async () => _ = await LengthPrefixedJsonFrame.ReadAsync<SearchCancelResponse>(stream, CancellationToken.None),
                "invalid frame length");
        }

        await using var oversized = PrefixOnly(CoreProtocol.MaximumFrameBytes + 1);
        await TestAssert.ThrowsCodeAsync(CoreErrorCodes.MessageTooLarge,
            async () => _ = await LengthPrefixedJsonFrame.ReadAsync<SearchCancelResponse>(oversized, CancellationToken.None),
            "oversized frame length");
    }

    private static async Task RejectsTruncatedPayloadAsync()
    {
        await using var stream = new MemoryStream();
        var header = new byte[4];
        BinaryPrimitives.WriteInt32LittleEndian(header, 20);
        await stream.WriteAsync(header);
        await stream.WriteAsync(Encoding.UTF8.GetBytes("{}"));
        stream.Position = 0;
        await TestAssert.ThrowsCodeAsync(CoreErrorCodes.InvalidFrame,
            async () => _ = await LengthPrefixedJsonFrame.ReadAsync<SearchCancelResponse>(stream, CancellationToken.None),
            "truncated frame");
    }

    private static async Task RejectsUnknownJsonMembersAsync()
    {
        var payload = Encoding.UTF8.GetBytes("{\"accepted\":true,\"extra\":1}");
        await using var stream = new MemoryStream();
        var header = new byte[4];
        BinaryPrimitives.WriteInt32LittleEndian(header, payload.Length);
        await stream.WriteAsync(header);
        await stream.WriteAsync(payload);
        stream.Position = 0;
        await TestAssert.ThrowsCodeAsync(CoreErrorCodes.InvalidFrame,
            async () => _ = await LengthPrefixedJsonFrame.ReadAsync<SearchCancelResponse>(stream, CancellationToken.None),
            "unknown JSON member");
    }

    private static async Task RejectsOversizedWritesAsync()
    {
        await using var stream = new MemoryStream();
        var value = new LargeValue(new string('x', CoreProtocol.MaximumFrameBytes + 1));
        await TestAssert.ThrowsCodeAsync(CoreErrorCodes.MessageTooLarge,
            async () => await LengthPrefixedJsonFrame.WriteAsync(stream, value, CancellationToken.None),
            "oversized serialized frame");
    }

    private static MemoryStream PrefixOnly(int value)
    {
        var header = new byte[4];
        BinaryPrimitives.WriteInt32LittleEndian(header, value);
        return new MemoryStream(header);
    }

    private sealed record LargeValue(string Value);
}
