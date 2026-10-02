namespace Cap7CE.Core.Host;

internal sealed record ReaderServiceEndpoint(
    string ServiceName,
    string PipeName,
    string ExpectedServicePath,
    string? ExpectedFileVersion);

internal static class ReaderClientConstants
{
    private const string ServiceExecutableName = "Cap7CE.Core.Reader.Host.exe";

    public static ReaderServiceEndpoint Legacy { get; } = new(
        "Cap7CECoreReaderP21Probe",
        "cap7ce-core-reader-p21-probe",
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Cap7CE-Core-Reader-P21-Probe",
            ServiceExecutableName),
        null);

    public static ReaderServiceEndpoint Lifecycle { get; } = new(
        "Cap7CENtfsReaderP23Probe",
        "cap7ce-ntfs-reader-p23-probe",
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Cap7CE", "NtfsReader", "v1",
            ServiceExecutableName),
        "1.0.0.0");

    public static ReaderServiceEndpoint Capability { get; } = new(
        "Cap7CENtfsReaderP33b2Probe",
        "cap7ce-ntfs-reader-p33b2-probe",
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Cap7CE", "NtfsReader", "v1",
            ServiceExecutableName),
        "1.0.0.0");

    public static ReaderServiceEndpoint Production { get; } = new(
        "Cap7CENtfsReader",
        "cap7ce-ntfs-reader-v1",
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Cap7CE", "NtfsReader", "v1",
            ServiceExecutableName),
        "1.0.0.0");

    public static ReaderServiceEndpoint Recovery { get; } = new(
        "Cap7CENtfsReaderP37Probe",
        "cap7ce-ntfs-reader-p37-probe",
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Cap7CE-Core-Reader-P37-Probe",
            ServiceExecutableName),
        null);

    public static ReaderServiceEndpoint P37Lifecycle { get; } = new(
        "Cap7CENtfsReaderP37LifecycleProbe",
        "cap7ce-ntfs-reader-p37-lifecycle-probe",
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "Cap7CE-P37-Lifecycle", "NtfsReader", "v1",
            ServiceExecutableName),
        null);

#if P37_LIFECYCLE
    public static ReaderServiceEndpoint Product => P37Lifecycle;
#elif P37_RECOVERY
    public static ReaderServiceEndpoint Product => Recovery;
#elif P38_PRODUCT
    public static ReaderServiceEndpoint Product => Production;
#elif P33_CAPABILITY
    public static ReaderServiceEndpoint Product => Capability;
#else
    public static ReaderServiceEndpoint Product => Legacy;
#endif
}
