namespace Cap7CE.Core.Setup;

internal static class CapabilitySetupVersionPolicy
{
    public static void RequireUpgradeOrRepair(string installedValue, string targetValue)
    {
        if (!Version.TryParse(installedValue, out var installed)
            || !Version.TryParse(targetValue, out var target))
        {
            throw new InvalidDataException("ownership-invalid");
        }
        if (installed > target)
        {
            throw new InvalidDataException("capability-downgrade-not-supported");
        }
    }
}
