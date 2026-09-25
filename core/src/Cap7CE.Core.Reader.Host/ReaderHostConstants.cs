using Cap7CE.Core.Reader.Protocol;

namespace Cap7CE.Core.Reader.Host;

internal static class ReaderHostConstants
{
    private const string LegacyServiceName = "Cap7CECoreReaderP21Probe";
    private const string LegacyPipeName = "cap7ce-core-reader-p21-probe";
    private const string LegacyDataDirectoryName = "Cap7CE-Core-Reader-P21-Probe";
    private const string LifecycleServiceName = "Cap7CENtfsReaderP23Probe";
    private const string LifecyclePipeName = "cap7ce-ntfs-reader-p23-probe";
    public const ulong FixtureJournalId = 0xC7CE_0000_0000_0021;
    public static readonly ReaderOpaqueId FixtureVolumeId = new(0xC7CE_0000_0000_0002, 0x0000_0000_0000_0021);

    private static bool lifecycleProfile;

    public static string ServiceName => lifecycleProfile ? LifecycleServiceName : LegacyServiceName;

    public static string PipeName => lifecycleProfile ? LifecyclePipeName : LegacyPipeName;

    public static void UseLifecycleProfile() => lifecycleProfile = true;

    public static string DataDirectory => lifecycleProfile
        ? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Cap7CE", "NtfsReader", "v1")
        : Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            LegacyDataDirectoryName);

    public static string ConfigPath => Path.Combine(DataDirectory, "config.json");
}
