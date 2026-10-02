using System.IO.Pipes;

namespace Cap7CE.Core.Setup;

public static class CapabilitySetupActivationProtocol
{
    private static readonly byte[] Handshake = "C7CEACT1"u8.ToArray();
    private const int MaximumRequestBytes = 1_024;
    private const int MaximumResponseBytes = 4_096;

    public static async ValueTask<CapabilitySetupActivationResponse> SendAsync(
        NamedPipeClientStream pipe,
        uint expectedServerProcessId,
        CapabilitySetupActivationRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(pipe);
        Validate(request);
        CapabilitySetupPeerIdentity.ValidateServer(pipe, expectedServerProcessId);
        var payload = CapabilitySetupJson.Serialize(request);
        await pipe.WriteAsync(Handshake, cancellationToken);
        await CapabilitySetupActivationFrameCodec.WriteAsync(
            pipe, payload, MaximumRequestBytes, "activation-request-size", cancellationToken);
        var responsePayload = await CapabilitySetupActivationFrameCodec.ReadAsync(
            pipe, MaximumResponseBytes, "activation-response-size", cancellationToken);
        return CapabilitySetupJson.DeserializeActivationResponse(responsePayload)
            ?? throw new InvalidDataException("activation-response-empty");
    }

    public static async ValueTask<CapabilitySetupAuthenticatedRequest> ReceiveAsync(
        NamedPipeServerStream pipe,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(pipe);
        var handshake = new byte[Handshake.Length];
        await pipe.ReadExactlyAsync(handshake, cancellationToken);
        if (!handshake.AsSpan().SequenceEqual(Handshake))
        {
            throw new InvalidDataException("activation-handshake");
        }
        var requester = CapabilitySetupPeerIdentity.ResolveRequester(pipe);

        var payload = await CapabilitySetupActivationFrameCodec.ReadAsync(
            pipe, MaximumRequestBytes, "activation-request-size", cancellationToken);
        var request = CapabilitySetupJson.DeserializeActivationRequest(payload)
            ?? throw new InvalidDataException("activation-request-empty");
        Validate(request);
        return new(request, requester);
    }

    public static async ValueTask RespondAsync(
        NamedPipeServerStream pipe,
        CapabilitySetupActivationResponse response,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(pipe);
        ArgumentNullException.ThrowIfNull(response);
        var payload = CapabilitySetupJson.Serialize(response);
        await CapabilitySetupActivationFrameCodec.WriteAsync(
            pipe, payload, MaximumResponseBytes, "activation-response-size", cancellationToken);
    }

    private static void Validate(CapabilitySetupActivationRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        var volumeLetters = CapabilitySetupVolumeSelection.RequireValid(request.VolumeLetters);
        if (request.SchemaVersion != 1
            || request.Action is not (CapabilitySetupAction.Enable or CapabilitySetupAction.Repair or CapabilitySetupAction.Remove)
            || (request.Action != CapabilitySetupAction.Remove
                && request.CatalogDisposition != CapabilityCatalogDisposition.Preserve)
            || (request.Action == CapabilitySetupAction.Remove && volumeLetters.Count != 0))
        {
            throw new InvalidDataException("invalid-activation-request");
        }
    }
}
