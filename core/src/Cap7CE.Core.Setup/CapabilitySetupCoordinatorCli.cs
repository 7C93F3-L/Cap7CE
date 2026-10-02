namespace Cap7CE.Core.Setup;

public static class CapabilitySetupCoordinatorCli
{
    public static bool IsRequest(string[] args) =>
        CapabilitySetupCoordinatorArguments.IsRequest(args);

    public static bool TryParseRequest(
        string[] args,
        out CapabilitySetupAction action,
        out CapabilityCatalogDisposition catalogDisposition,
        out IReadOnlyList<string> volumeLetters) =>
        CapabilitySetupCoordinatorArguments.TryParseRequest(
            args,
            out action,
            out catalogDisposition,
            out volumeLetters);

    public static async Task<int> RunAsync(
        string[] args,
        TextWriter output,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(args);
        ArgumentNullException.ThrowIfNull(output);
        if (!TryParseRequest(args, out var action, out var catalogDisposition, out var volumeLetters)) return 2;

        var executablePath = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(executablePath) || !Path.IsPathFullyQualified(executablePath))
        {
            return await FailAsync(output, "activation-current-image-unavailable");
        }

        var pipeName = CapabilitySetupActivationPipe.CreateName();
        var launch = CapabilitySetupElevatedServerLauncher.Start(executablePath, pipeName);
        var server = launch.Server;
        if (server is null) return await FailAsync(output, launch.FailureReason ?? "activation-elevation-failed");

        using (server)
        {
            var clientArguments = new List<string>
            {
                "--activation-client",
                "--pipe-name", pipeName,
                "--server-pid", server.Id.ToString(System.Globalization.CultureInfo.InvariantCulture),
                "--action", CapabilitySetupArgumentValues.ActionArgument(action),
                "--catalog", CapabilitySetupArgumentValues.CatalogArgument(catalogDisposition)
            };
            if (volumeLetters.Count != 0)
            {
                clientArguments.Add("--volumes");
                clientArguments.Add(string.Join(',', volumeLetters));
            }
            var clientExitCode = await CapabilitySetupActivationCli.RunClientAsync(
                clientArguments.ToArray(),
                output,
                cancellationToken);
            await server.WaitForExitAsync(cancellationToken);
            return clientExitCode == 0 && server.ExitCode == 0 ? 0 : 4;
        }
    }

    private static async Task<int> FailAsync(TextWriter output, string reason)
    {
        var response = new CapabilitySetupActivationResponse(
            "failed", reason, null, null, false, false);
        await output.WriteLineAsync(CapabilitySetupJson.SerializeToString(response));
        return 5;
    }
}
