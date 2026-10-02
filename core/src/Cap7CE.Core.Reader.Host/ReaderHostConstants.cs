using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Reader.Host;

internal static class ReaderHostConstants
{
    private const string LegacyServiceName = "Cap7CECoreReaderP21Probe";
    private const string LegacyPipeName = "cap7ce-core-reader-p21-probe";
    private const string LegacyDataDirectoryName = "Cap7CE-Core-Reader-P21-Probe";
    private const string LifecycleServiceName = "Cap7CENtfsReaderP23Probe";
    private const string LifecyclePipeName = "cap7ce-ntfs-reader-p23-probe";
    private const string CapabilityServiceName = "Cap7CENtfsReaderP33b2Probe";
    private const string CapabilityPipeName = "cap7ce-ntfs-reader-p33b2-probe";
    private const string ProductServiceName = "Cap7CENtfsReader";
    private const string ProductPipeName = "cap7ce-ntfs-reader-v1";
    private const string RecoveryServiceName = "Cap7CENtfsReaderP37Probe";
    private const string RecoveryPipeName = "cap7ce-ntfs-reader-p37-probe";
    private const string RecoveryDataDirectoryName = "Cap7CE-Core-Reader-P37-Probe";
    private const string P37LifecycleServiceName = "Cap7CENtfsReaderP37LifecycleProbe";
    private const string P37LifecyclePipeName = "cap7ce-ntfs-reader-p37-lifecycle-probe";
    private const string P37LifecycleDirectoryName = "Cap7CE-P37-Lifecycle";
    public const ulong FixtureJournalId = 0xC7CE_0000_0000_0021;
    public static readonly ReaderOpaqueId FixtureVolumeId = new(0xC7CE_0000_0000_0002, 0x0000_0000_0000_0021);

    private static bool lifecycleProfile;
    private static bool capabilityProfile;
    private static bool recoveryProfile;
    private static bool p37LifecycleProfile;
    private static bool productProfile;

    public static string ServiceName => productProfile
        ? ProductServiceName
        : p37LifecycleProfile
        ? P37LifecycleServiceName
        : recoveryProfile
        ? RecoveryServiceName
        : capabilityProfile
        ? CapabilityServiceName
        : lifecycleProfile ? LifecycleServiceName : LegacyServiceName;

    public static string PipeName => productProfile
        ? ProductPipeName
        : p37LifecycleProfile
        ? P37LifecyclePipeName
        : recoveryProfile
        ? RecoveryPipeName
        : capabilityProfile
        ? CapabilityPipeName
        : lifecycleProfile ? LifecyclePipeName : LegacyPipeName;

    public static void UseLifecycleProfile() => lifecycleProfile = true;

    public static void UseCapabilityProfile()
    {
        capabilityProfile = true;
    }

    public static void UseRecoveryProfile() => recoveryProfile = true;

    public static void UseP37LifecycleProfile() => p37LifecycleProfile = true;

    public static void UseProductProfile() => productProfile = true;

    public static string DataDirectory => productProfile
        ? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Cap7CE", "NtfsReader", "v1")
        : p37LifecycleProfile
        ? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            P37LifecycleDirectoryName, "NtfsReader", "v1")
        : recoveryProfile
        ? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            RecoveryDataDirectoryName)
        : capabilityProfile || lifecycleProfile
        ? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Cap7CE", "NtfsReader", "v1")
        : Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            LegacyDataDirectoryName);

    public static string ConfigPath => Path.Combine(DataDirectory, "config.json");
}
