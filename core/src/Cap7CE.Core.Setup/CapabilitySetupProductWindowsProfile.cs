namespace Cap7CE.Core.Setup;

internal static class CapabilitySetupProductWindowsProfile
{
    public static CapabilitySetupWindowsProfile Current { get; } = new(
        "Cap7CENtfsReader",
        "cap7ce-ntfs-reader-v1",
        "Cap7CE",
        "Cap7CE NTFS Reader",
        @"CapabilitySetup\v1");
}
