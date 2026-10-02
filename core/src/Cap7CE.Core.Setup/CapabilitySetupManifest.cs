using System.Text.RegularExpressions;

namespace Cap7CE.Core.Setup;

public sealed record CapabilityRuntimePolicy(
    string FrameworkName,
    string MinimumVersion,
    string Architecture,
    string InstallerUrl,
    string InstallerSha512,
    string Presentation,
    string[] InstallArguments,
    string[] RepairArguments,
    int[] SuccessExitCodes,
    bool AutomaticRestart);

public sealed record CapabilityLayoutPolicy(
    string CoreProgramDirectory,
    string ReaderProgramDirectory,
    string ReaderDataDirectory,
    string CatalogDirectory);

public sealed record CapabilityOwnershipPolicy(
    string Runtime,
    string ProgramFiles,
    string ProgramData,
    string Catalog);

public sealed record CapabilitySetupManifest(
    int SchemaVersion,
    string CapabilityId,
    string CapabilityVersion,
    CapabilityRuntimePolicy Runtime,
    CapabilityLayoutPolicy Layout,
    CapabilityOwnershipPolicy Ownership,
    bool PayloadManifestRequiredAtBuild,
    bool SystemMutationImplemented)
{
    private const string EmbeddedName = "Cap7CE.Core.Setup.capability-setup-manifest.v1.json";
    private static readonly Regex Sha512Pattern = new("^[0-9a-f]{128}$", RegexOptions.CultureInvariant);

    public static CapabilitySetupManifest LoadEmbedded()
    {
        using var stream = typeof(CapabilitySetupManifest).Assembly.GetManifestResourceStream(EmbeddedName)
            ?? throw new InvalidDataException("capability-manifest-missing");
        var manifest = CapabilitySetupJson.DeserializeManifest(stream)
            ?? throw new InvalidDataException("capability-manifest-empty");
        manifest.Validate();
        return manifest;
    }

    public void Validate()
    {
        Require(SchemaVersion == 1, "manifest-schema");
        Require(CapabilityId == "cap7ce-core", "manifest-capability-id");
        Require(Version.TryParse(CapabilityVersion, out _), "manifest-capability-version");
        Require(Runtime.FrameworkName == "Microsoft.NETCore.App", "manifest-runtime-framework");
        Require(Version.TryParse(Runtime.MinimumVersion, out var runtimeVersion)
            && runtimeVersion.Major == 10 && runtimeVersion.Minor == 0, "manifest-runtime-version");
        Require(Runtime.Architecture == "win-x64", "manifest-runtime-architecture");
        Require(Uri.TryCreate(Runtime.InstallerUrl, UriKind.Absolute, out var installerUri)
            && installerUri.Scheme == Uri.UriSchemeHttps
            && installerUri.Host == "builds.dotnet.microsoft.com", "manifest-runtime-url");
        Require(Sha512Pattern.IsMatch(Runtime.InstallerSha512), "manifest-runtime-sha512");
        Require(Runtime.Presentation == "foreground", "manifest-runtime-presentation");
        Require(Runtime.InstallArguments.SequenceEqual(["/install", "/norestart"]), "manifest-runtime-install-arguments");
        Require(Runtime.RepairArguments.SequenceEqual(["/repair", "/norestart"]), "manifest-runtime-repair-arguments");
        Require(Runtime.SuccessExitCodes.SequenceEqual([0, 3010]), "manifest-runtime-exit-codes");
        Require(!Runtime.AutomaticRestart, "manifest-runtime-auto-restart");
        Require(Layout.CoreProgramDirectory == @"%ProgramFiles%\Cap7CE\Core\v1", "manifest-core-layout");
        Require(Layout.ReaderProgramDirectory == @"%ProgramFiles%\Cap7CE\NtfsReader\v1", "manifest-reader-layout");
        Require(Layout.ReaderDataDirectory == @"%ProgramData%\Cap7CE\NtfsReader\v1", "manifest-reader-data-layout");
        Require(Layout.CatalogDirectory == @"%LocalAppData%\Cap7CE\Core", "manifest-catalog-layout");
        Require(Ownership.Runtime == "shared-external-never-remove", "manifest-runtime-ownership");
        Require(Ownership.ProgramFiles == "cap7ce-capability", "manifest-program-ownership");
        Require(Ownership.ProgramData == "cap7ce-capability", "manifest-data-ownership");
        Require(Ownership.Catalog == "per-user-separate-choice", "manifest-catalog-ownership");
        Require(PayloadManifestRequiredAtBuild, "manifest-payload-hashes");
        Require(SystemMutationImplemented, "manifest-system-mutation");
    }

    private static void Require(bool condition, string reason)
    {
        if (!condition) throw new InvalidDataException(reason);
    }
}
