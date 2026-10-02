using System.Text.Json;

namespace Cap7CE.Core.Setup;

public static class CapabilitySetupDryRunCli
{
    public static async Task<int> RunAsync(
        string[] args,
        TextReader input,
        TextWriter output,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(args);
        ArgumentNullException.ThrowIfNull(input);
        ArgumentNullException.ThrowIfNull(output);

        if (args is not ["--dry-run-plan"])
        {
            await WriteAsync(output, new("unavailable", "setup-contract-only", false));
            return 2;
        }

        try
        {
            var source = await input.ReadToEndAsync(cancellationToken);
            var request = CapabilitySetupJson.DeserializePlanRequest(source)
                ?? throw new JsonException("empty-request");
            var plan = CapabilitySetupPlanner.Plan(request, CapabilitySetupManifest.LoadEmbedded());
            await output.WriteLineAsync(CapabilitySetupJson.Serialize(plan));
            return 0;
        }
        catch (Exception error) when (error is JsonException or InvalidDataException)
        {
            await WriteAsync(output, new("failed", "invalid-dry-run-request", false));
            return 2;
        }
    }

    private static Task WriteAsync(TextWriter output, CapabilitySetupCliStatus value) =>
        output.WriteLineAsync(CapabilitySetupJson.Serialize(value));
}
