using System.Text.Json;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Tests;

internal sealed class ProtocolClient(Stream stream)
{
    public async Task SendAsync<T>(
        string requestId,
        string operation,
        T body,
        int deadlineMs = 5_000,
        int protocolVersion = CoreProtocol.CurrentVersion)
    {
        var request = new CoreRequestEnvelope(
            protocolVersion,
            requestId,
            operation,
            deadlineMs,
            CoreProtocolJson.ToElement(body));
        await LengthPrefixedJsonFrame.WriteAsync(stream, request, CancellationToken.None)
            .AsTask().WaitAsync(TimeSpan.FromSeconds(10));
    }

    public async Task<CoreResponseEnvelope> ReadAsync()
    {
        var response = await LengthPrefixedJsonFrame.ReadAsync<CoreResponseEnvelope>(stream, CancellationToken.None)
            .AsTask().WaitAsync(TimeSpan.FromSeconds(10));
        return response ?? throw new InvalidOperationException("Host closed the pipe before sending a response.");
    }

    public async Task<CoreResponseEnvelope> RequestAsync<T>(
        string requestId,
        string operation,
        T body,
        int deadlineMs = 5_000,
        int protocolVersion = CoreProtocol.CurrentVersion)
    {
        await SendAsync(requestId, operation, body, deadlineMs, protocolVersion);
        return await ReadAsync();
    }

    public static T ReadBody<T>(CoreResponseEnvelope response)
        where T : class
    {
        TestAssert.Equal(CoreResponseStatuses.Success, response.Status, $"request {response.RequestId} status");
        if (response.Body is null)
        {
            throw new InvalidOperationException("Successful response body was missing.");
        }
        return response.Body.Value.Deserialize<T>(CoreProtocolJson.Options)
            ?? throw new InvalidOperationException("Successful response body was missing.");
    }
}
