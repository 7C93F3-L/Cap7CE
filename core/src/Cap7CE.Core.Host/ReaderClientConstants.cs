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
}
