using Cap7CE.Core.Setup;

namespace Cap7CE.Core.Tests;

internal static class CapabilitySetupVersionTests
{
    public static void Run()
    {
        CapabilitySetupVersionPolicy.RequireUpgradeOrRepair("1.0.0", "1.0.0");
        CapabilitySetupVersionPolicy.RequireUpgradeOrRepair("1.0.0", "1.0.1");
        Rejects("1.0.1", "1.0.0", "capability-downgrade-not-supported");
        Rejects("invalid", "1.0.1", "ownership-invalid");
    }

    private static void Rejects(string installed, string target, string reason)
    {
        try
        {
            CapabilitySetupVersionPolicy.RequireUpgradeOrRepair(installed, target);
            throw new InvalidOperationException("expected version policy rejection");
        }
        catch (InvalidDataException error)
        {
            TestAssert.Equal(reason, error.Message, "capability version policy reason");
        }
    }
}
