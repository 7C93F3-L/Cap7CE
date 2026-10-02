namespace Cap7CE.Core.Setup;
internal sealed record CapabilitySetupWindowsProfile(
    string ServiceName,
    string PipeName,
    string ProductDirectory,
    string DisplayName,
    string StateRelativePath)
{
    public static CapabilitySetupWindowsProfile Current { get; } = Create();
    private static CapabilitySetupWindowsProfile Create()
    {
#if P37_LIFECYCLE
        return new(
            "Cap7CENtfsReaderP37LifecycleProbe",
            "cap7ce-ntfs-reader-p37-lifecycle-probe",
            "Cap7CE-P37-Lifecycle",
            "Cap7CE NTFS Reader P3.7 Lifecycle Probe",
            "CapabilitySetup");
#elif P38_PRODUCT
        return CapabilitySetupProductWindowsProfile.Current;
#else
        return new(
            CapabilitySetupWindowsPolicy.DevelopmentServiceName,
            CapabilitySetupWindowsPolicy.DevelopmentPipeName,
            "Cap7CE",
            "Cap7CE NTFS Reader P3.3b2 Probe",
            @"CapabilitySetup\p33b2");
#endif
    }
}
