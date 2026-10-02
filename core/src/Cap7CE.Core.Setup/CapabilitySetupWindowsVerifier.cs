namespace Cap7CE.Core.Setup;

internal static class CapabilitySetupWindowsVerifier
{
    public static async ValueTask VerifyInstalledAsync(
        CapabilitySetupWindowsPolicy policy,
        CapabilityPayloadManifest payloadManifest,
        CapabilitySetupManifest setupManifest,
        CancellationToken cancellationToken)
    {
        try
        {
            _ = await CapabilitySetupPayloadVerifier.VerifyInstalledAsync(
                policy.Layout.CoreProgramDirectory,
                policy.Layout.ReaderProgramDirectory,
                payloadManifest,
                setupManifest,
                cancellationToken);
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            throw new CapabilitySetupTransactionFailure("installed-payload-invalid", error);
        }

        try
        {
            CapabilitySetupWindowsAcl.RequireProtected(policy.Layout.CoreProgramDirectory);
            CapabilitySetupWindowsAcl.RequireProtected(policy.Layout.ReaderProgramDirectory);
            CapabilitySetupWindowsAcl.RequireProtected(policy.Layout.ReaderDataDirectory);
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            throw new CapabilitySetupTransactionFailure("installed-acl-invalid", error);
        }

        try
        {
            CapabilitySetupWindowsService.Verify(policy.ReaderService);
        }
        catch (CapabilitySetupTransactionFailure) { throw; }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            throw new CapabilitySetupTransactionFailure("installed-service-invalid", error);
        }

        if (!File.Exists(policy.ReaderService.ConfigurationPath))
        {
            throw new CapabilitySetupTransactionFailure(
                "reader-configuration-missing", new FileNotFoundException());
        }
    }
}
