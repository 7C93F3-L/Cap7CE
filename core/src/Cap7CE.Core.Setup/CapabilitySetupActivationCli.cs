namespace Cap7CE.Core.Setup;

public static class CapabilitySetupActivationCli
{
    private const string ServerMode = "--activation-server";
    private const string FailureServerMode = "--activation-server-failure-probe";

    public static bool IsServerRequest(string[] args) =>
        args is [ServerMode or FailureServerMode, "--pipe-name", _];

    public static bool IsClientRequest(string[] args) =>
        CapabilitySetupActivationArguments.IsClientRequest(args);

    public static async Task<int> RunServerAsync(
        string[] args,
        TextWriter output,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(args);
        ArgumentNullException.ThrowIfNull(output);
        if (args is not [var mode, "--pipe-name", var pipeName]
            || mode is not (ServerMode or FailureServerMode))
        {
            return 2;
        }

        await using var server = CapabilitySetupActivationPipe.CreateServer(pipeName);
        await server.WaitForConnectionAsync(cancellationToken);
        CapabilitySetupActivationResponse response;
        try
        {
            var authenticated = await CapabilitySetupActivationProtocol.ReceiveAsync(server, cancellationToken);
            var manifest = CapabilitySetupManifest.LoadEmbedded();
            var payloadManifest = CapabilityPayloadManifest.LoadEmbedded(manifest);
            var policy = CapabilitySetupWindowsPolicy.Create(authenticated.Requester);
            ICapabilitySetupTransactionBackend backend = new CapabilitySetupWindowsBackend(
                policy,
                manifest,
                payloadManifest,
                authenticated.Request.Action,
                authenticated.Request.CatalogDisposition,
                authenticated.Request.VolumeLetters);
            if (mode == FailureServerMode)
            {
                backend = new CapabilitySetupFailureInjectingBackend(backend);
            }
            var plan = CapabilitySetupTransactionPlanner.Create(
                authenticated.Request.Action,
                authenticated.Request.CatalogDisposition);
            var result = await CapabilitySetupTransactionRunner.RunAsync(plan, backend, cancellationToken);
            response = new(
                result.Status is CapabilitySetupTransactionStatus.Succeeded
                    or CapabilitySetupTransactionStatus.SucceededCleanupPending ? "passed" : "failed",
                result.Reason,
                result.Status,
                result.FailedStage,
                result.SystemChangesCommitted,
                result.CleanupRequired);
        }
        catch (OperationCanceledException)
        {
            response = Failure("activation-cancelled");
        }
        catch (Exception)
        {
            response = Failure("activation-failed");
        }

        await CapabilitySetupActivationProtocol.RespondAsync(server, response, CancellationToken.None);
        await output.WriteLineAsync(CapabilitySetupJson.SerializeToString(response));
        return response.Status == "passed" ? 0 : 4;
    }

    public static async Task<int> RunClientAsync(
        string[] args,
        TextWriter output,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(args);
        ArgumentNullException.ThrowIfNull(output);
        if (!CapabilitySetupActivationArguments.TryParseClientRequest(args, out var options))
        {
            return 2;
        }

        await using var client = CapabilitySetupActivationPipe.CreateClient(options.PipeName);
        await client.ConnectAsync(30_000, cancellationToken);
        var response = await CapabilitySetupActivationProtocol.SendAsync(
            client,
            options.ServerProcessId,
            new(1, options.Action, options.CatalogDisposition, options.VolumeLetters),
            cancellationToken);
        await output.WriteLineAsync(CapabilitySetupJson.SerializeToString(response));
        return response.Status == "passed" ? 0 : 4;
    }

    private static CapabilitySetupActivationResponse Failure(string reason) =>
        new("failed", reason, null, null, false, true);
}
