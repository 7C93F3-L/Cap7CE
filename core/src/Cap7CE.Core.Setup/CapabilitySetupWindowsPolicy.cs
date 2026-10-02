using System.Security.Principal;

namespace Cap7CE.Core.Setup;

public sealed record CapabilitySetupWindowsLayout(
    string PayloadDirectory,
    string CoreProgramDirectory,
    string ReaderProgramDirectory,
    string ReaderDataDirectory,
    string StateDirectory,
    string CatalogDirectory);

public sealed record CapabilitySetupReaderServicePolicy(
    string ServiceName,
    string PipeName,
    string DisplayName,
    string ExecutablePath,
    string ConfigurationPath,
    string ServiceDacl);

public sealed record CapabilitySetupWindowsPolicy(
    CapabilitySetupWindowsLayout Layout,
    CapabilitySetupReaderServicePolicy ReaderService,
    string OwnershipPath,
    string RequesterSid)
{
    public const string DevelopmentServiceName = "Cap7CENtfsReaderP33b2Probe";
    public const string DevelopmentPipeName = "cap7ce-ntfs-reader-p33b2-probe";
    public static CapabilitySetupWindowsPolicy Create(CapabilityRequesterIdentity requester)
    {
        ArgumentNullException.ThrowIfNull(requester);
        _ = new SecurityIdentifier(requester.UserSid);
        var programFiles = RequireRoot(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "program-files");
        var programData = RequireRoot(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "program-data");
        var localApplicationData = RequireRoot(requester.LocalApplicationData, "local-app-data");
        var baseDirectory = RequireRoot(AppContext.BaseDirectory, "setup-base");
        var profile = CapabilitySetupWindowsProfile.Current;

        var layout = new CapabilitySetupWindowsLayout(
            Path.Combine(baseDirectory, "payload"),
            Path.Combine(programFiles, profile.ProductDirectory, "Core", "v1"),
            Path.Combine(programFiles, profile.ProductDirectory, "NtfsReader", "v1"),
            Path.Combine(programData, profile.ProductDirectory, "NtfsReader", "v1"),
            Path.Combine(programFiles, profile.ProductDirectory, profile.StateRelativePath),
            Path.Combine(localApplicationData, profile.ProductDirectory, "Core"));
        var service = new CapabilitySetupReaderServicePolicy(
            profile.ServiceName,
            profile.PipeName,
            profile.DisplayName,
            Path.Combine(layout.ReaderProgramDirectory, "Cap7CE.Core.Reader.Host.exe"),
            Path.Combine(layout.ReaderDataDirectory, "config.json"),
            $"D:P(A;;0x000F01FF;;;SY)(A;;0x000F01FF;;;BA)(A;;0x00000015;;;{requester.UserSid})");
        return new(layout, service, Path.Combine(layout.StateDirectory, "ownership.json"), requester.UserSid);
    }

    private static string RequireRoot(string path, string reason)
    {
        if (string.IsNullOrWhiteSpace(path) || !Path.IsPathFullyQualified(path))
        {
            throw new InvalidDataException($"invalid-{reason}");
        }
        var fullPath = Path.GetFullPath(path);
        if (Path.GetPathRoot(fullPath)?.Equals(fullPath, StringComparison.OrdinalIgnoreCase) == true)
        {
            throw new InvalidDataException($"invalid-{reason}");
        }
        return fullPath.TrimEnd(Path.DirectorySeparatorChar);
    }
}
