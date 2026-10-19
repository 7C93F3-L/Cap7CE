using System.IO.Pipes;
using Cap7CE.Core.Host;
using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Tests;

internal static class ReaderSessionCapabilityTests
{
    public static async Task RunAsync()
    {
        await CheckAsync(false, true);
        await CheckAsync(true, true);
        await CheckAsync(false, false);
        Console.WriteLine("Reader authenticated-session capability: actual CR/2 pipe handshake rejects old production sessions into repair, accepts current sessions, preserves diagnostic compatibility and closes cleanly.");
    }
    private static async Task CheckAsync(bool advertised, bool required)
    {
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var name = "cap7ce-reader-lifetime-" + Guid.NewGuid().ToString("N");
        using var server = new NamedPipeServerStream(name, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
        using var client = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous);
        var waiting = server.WaitForConnectionAsync(deadline.Token);await client.ConnectAsync(deadline.Token);await waiting;
        var serving = Task.Run(async () => {
            var request = await ReaderFrameCodec.ReadAsync(server, deadline.Token);
            var hello = ReaderPayloadCodec.DecodeHelloRequest(request.Payload.Span);
            var capabilities = ReaderCapabilities.SnapshotPaging | ReaderCapabilities.JournalPaging | ReaderCapabilities.MultiVolume | ReaderCapabilities.BasicFacts;
            if (advertised) capabilities |= ReaderCapabilities.AuthenticatedSessions;
            await ReaderFrameCodec.WriteAsync(server, ReaderFrame.ResponseFor(request, ReaderStatus.Success, ReaderFrameFlags.None,
                ReaderPayloadCodec.EncodeHelloResponse(new(hello.Nonce, (uint)Environment.ProcessId, ReaderProtocol.MaximumPayloadBytes, ReaderProtocol.MaximumRecordsPerPage, capabilities))), deadline.Token);
            try {
                var cancel = await ReaderFrameCodec.ReadAsync(server, deadline.Token);
                TestAssert.Equal(ReaderOperation.Cancel, cancel.Header.Operation, "accepted session uses the existing graceful cancel");
                await ReaderFrameCodec.WriteAsync(server, ReaderFrame.ResponseFor(cancel, ReaderStatus.Cancelled, ReaderFrameFlags.None, ReadOnlyMemory<byte>.Empty), deadline.Token);
            } catch (ReaderProtocolException error) when (required && !advertised && error.Message == "truncated-header") { }
        }, deadline.Token);
        using var connection = new ReaderPipeConnection(client, (uint)Environment.ProcessId, true);
        try {
            if (required && !advertised) await TestAssert.ThrowsAsync<ReaderRepairRequiredException>(async () => {
                _ = await ReaderV2CatalogSession.ConnectAsync(connection, deadline.Token, required);
            }, "old production Reader must request explicit repair before catalog work");
            else {
                var session = await ReaderV2CatalogSession.ConnectAsync(connection, deadline.Token, required);
                TestAssert.Equal(advertised, session.SupportsAuthenticatedSessions, "authenticated capability round trips");
                await session.DisposeAsync();
            }
        } finally { connection.Dispose(); await serving; }
    }
}
