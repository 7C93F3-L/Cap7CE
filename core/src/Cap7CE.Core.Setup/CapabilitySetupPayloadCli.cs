namespace Cap7CE.Core.Setup;

public static class CapabilitySetupPayloadCli
{
    public static async Task<int> RunAsync(
        TextWriter output,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(output);
        try
        {
            var setupManifest = CapabilitySetupManifest.LoadEmbedded();
            var payloadManifest = CapabilityPayloadManifest.LoadEmbedded(setupManifest);
            var payloadRoot = Path.Combine(AppContext.BaseDirectory, "payload");
            var verified = await CapabilitySetupPayloadVerifier.VerifyAsync(
                payloadRoot, payloadManifest, setupManifest, cancellationToken);
            await WriteAsync(output, new("verified", "payload-verified",
                verified.Manifest.Files.Length, verified.TotalBytes, false));
            return 0;
        }
        catch (InvalidDataException error)
        {
            await WriteAsync(output, new("failed", error.Message, 0, 0, false));
            return 2;
        }
        catch (Exception)
        {
            await WriteAsync(output, new("failed", "payload-verification-failed", 0, 0, false));
            return 2;
        }
    }

    private static Task WriteAsync(TextWriter output, CapabilityPayloadCliStatus value) =>
        output.WriteLineAsync(CapabilitySetupJson.Serialize(value));
}
