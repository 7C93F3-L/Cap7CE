using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host;

public sealed class CorePipeSession
{
    private readonly CoreRequestDispatcher dispatcher;
    private readonly byte[] expectedSecret;
    private readonly int clientProcessId;
    private readonly ConcurrentDictionary<string, byte> requestIds = new(StringComparer.Ordinal);
    private readonly SemaphoreSlim writeLock = new(1, 1);

    public CorePipeSession(byte[] expectedSecret, int clientProcessId)
    {
        this.expectedSecret = expectedSecret;
        this.clientProcessId = clientProcessId;
        dispatcher = new CoreRequestDispatcher(new SyntheticMetadataSearchSource(), new SearchCursorCodec());
    }

    public CorePipeSession(byte[] expectedSecret, int clientProcessId, ProductCoreRuntime runtime)
    {
        this.expectedSecret = expectedSecret;
        this.clientProcessId = clientProcessId;
        dispatcher = new CoreRequestDispatcher(runtime, new ProductSearchCursorCodec());
    }

    public async Task RunAsync(Stream stream, CancellationToken cancellationToken)
    {
        CoreRequestEnvelope? hello;
        try
        {
            hello = await ReadRequestAsync(stream, cancellationToken);
        }
        catch (CoreProtocolException)
        {
            return;
        }
        if (hello is null) return;

        if (!IsRequestIdentityValid(hello) || hello.Operation != CoreOperations.SessionHello)
        {
            await WriteAsync(stream, CoreResponseEnvelope.Failure(
                SafeRequestId(hello.RequestId), 1, CoreErrorCodes.HandshakeRequired,
                "handshake", false, "A valid session handshake must be the first request."), cancellationToken);
            return;
        }
        if (!requestIds.TryAdd(hello.RequestId, 0)) return;

        var handshakeResponse = ValidateHandshake(hello);
        await WriteAsync(stream, handshakeResponse, cancellationToken);
        if (handshakeResponse.Status != CoreResponseStatuses.Success) return;

        using var sessionEnded = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var pending = new List<Task>();
        try
        {
            while (!sessionEnded.IsCancellationRequested)
            {
                CoreRequestEnvelope? request;
                try
                {
                    request = await ReadRequestAsync(stream, sessionEnded.Token);
                }
                catch (CoreProtocolException)
                {
                    break;
                }
                if (request is null) break;

                if (!IsRequestIdentityValid(request))
                {
                    await WriteAsync(stream, CoreResponseEnvelope.Failure(
                        SafeRequestId(request.RequestId), 1, CoreErrorCodes.InvalidRequest,
                        "validation", false, "Request envelope is invalid."), sessionEnded.Token);
                    continue;
                }
                if (!requestIds.TryAdd(request.RequestId, 0))
                {
                    await WriteAsync(stream, CoreResponseEnvelope.Failure(
                        request.RequestId, 1, CoreErrorCodes.DuplicateRequest,
                        "validation", false, "Request identifier was already used."), sessionEnded.Token);
                    continue;
                }
                if (request.ProtocolVersion != CoreProtocol.CurrentVersion)
                {
                    await WriteAsync(stream, CoreResponseEnvelope.Failure(
                        request.RequestId, 1, CoreErrorCodes.UnsupportedProtocol,
                        "validation", false, "Protocol version is not supported."), sessionEnded.Token);
                    continue;
                }
                if (request.DeadlineMs is < 1 or > CoreProtocol.MaximumDeadlineMilliseconds)
                {
                    await WriteAsync(stream, CoreResponseEnvelope.Failure(
                        request.RequestId, 1, CoreErrorCodes.InvalidRequest,
                        "validation", false, "Deadline is outside protocol limits."), sessionEnded.Token);
                    continue;
                }

                pending.RemoveAll(task => task.IsCompleted);
                pending.Add(DispatchAndWriteAsync(stream, request, sessionEnded.Token));
            }
        }
        finally
        {
            sessionEnded.Cancel();
            await Task.WhenAll(pending);
        }
    }

    private CoreResponseEnvelope ValidateHandshake(CoreRequestEnvelope request)
    {
        if (request.ProtocolVersion != CoreProtocol.CurrentVersion)
        {
            return HandshakeFailure(request.RequestId, CoreErrorCodes.UnsupportedProtocol, "Protocol version is not supported.");
        }

        SessionHelloRequest body;
        try
        {
            body = request.Body.Deserialize<SessionHelloRequest>(CoreProtocolJson.Options)
                ?? throw new JsonException();
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException)
        {
            return HandshakeFailure(request.RequestId, CoreErrorCodes.InvalidRequest, "Handshake body is invalid.");
        }

        var authenticated = false;
        if (CoreHostOptions.TryDecodeSecret(body.SessionSecret, out var suppliedSecret))
        {
            try
            {
                authenticated = CryptographicOperations.FixedTimeEquals(suppliedSecret, expectedSecret);
            }
            finally
            {
                CryptographicOperations.ZeroMemory(suppliedSecret);
            }
        }

        if (string.IsNullOrEmpty(body.ClientName)
            || body.ClientName.Length > 128
            || string.IsNullOrEmpty(body.ClientProductVersion)
            || body.ClientProductVersion.Length > 64
            || body.ClientProcessId != clientProcessId
            || body.SupportedProtocolVersions is null
            || !body.SupportedProtocolVersions.Contains(CoreProtocol.CurrentVersion)
            || !authenticated)
        {
            return HandshakeFailure(request.RequestId, CoreErrorCodes.AuthenticationFailed, "Session authentication failed.");
        }

        return CoreResponseEnvelope.Success(request.RequestId, 1, new SessionHelloResponse(
            CoreProtocol.CurrentVersion,
            "Cap7CE.Core.Host",
            "1.0.4",
            Environment.ProcessId,
            CoreProtocol.MaximumFrameBytes,
            CoreProtocol.MaximumPageSize,
            dispatcher.Capabilities,
            dispatcher.SyntheticFixture));
    }

    private async Task DispatchAndWriteAsync(
        Stream stream,
        CoreRequestEnvelope request,
        CancellationToken cancellationToken)
    {
        var response = await dispatcher.DispatchAsync(request, cancellationToken);
        try
        {
            await WriteAsync(stream, response, cancellationToken);
        }
        catch (Exception error) when (error is IOException or ObjectDisposedException or OperationCanceledException)
        {
            // The client owns the session lifetime; disconnects are not host failures.
        }
    }

    private async Task WriteAsync(Stream stream, CoreResponseEnvelope response, CancellationToken cancellationToken)
    {
        await writeLock.WaitAsync(cancellationToken);
        try
        {
            await LengthPrefixedJsonFrame.WriteAsync(stream, response, cancellationToken);
        }
        finally
        {
            writeLock.Release();
        }
    }

    private static ValueTask<CoreRequestEnvelope?> ReadRequestAsync(Stream stream, CancellationToken cancellationToken) =>
        LengthPrefixedJsonFrame.ReadAsync<CoreRequestEnvelope>(stream, cancellationToken);

    private static bool IsRequestIdentityValid(CoreRequestEnvelope request) =>
        !string.IsNullOrEmpty(request.RequestId)
        && request.RequestId.Length <= CoreProtocol.MaximumRequestIdLength
        && request.RequestId.All(character => char.IsAsciiLetterOrDigit(character) || character is '-' or '_')
        && !string.IsNullOrEmpty(request.Operation)
        && request.Operation.Length <= 128;

    private static string SafeRequestId(string requestId) =>
        !string.IsNullOrEmpty(requestId) && requestId.Length <= CoreProtocol.MaximumRequestIdLength ? requestId : "invalid";

    private static CoreResponseEnvelope HandshakeFailure(string requestId, string code, string message) =>
        CoreResponseEnvelope.Failure(requestId, 1, code, "handshake", false, message);
}
