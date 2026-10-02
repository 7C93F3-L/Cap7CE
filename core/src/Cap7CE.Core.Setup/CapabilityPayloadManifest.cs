using System.Text.RegularExpressions;

namespace Cap7CE.Core.Setup;

public enum CapabilityPayloadComponent
{
    Core,
    Reader
}

public sealed record CapabilityPayloadFile(
    CapabilityPayloadComponent Component,
    string RelativePath,
    long Length,
    string Sha256);

public sealed record CapabilityPayloadManifest(
    int SchemaVersion,
    string CapabilityId,
    string CapabilityVersion,
    CapabilityPayloadFile[] Files)
{
    private const string EmbeddedName = "Cap7CE.Core.Setup.capability-payload-manifest.v1.json";
    private const int MaximumFiles = 256;
    private const long MaximumTotalBytes = 512L * 1024 * 1024;
    private static readonly Regex SegmentPattern = new(
        "^[A-Za-z0-9][A-Za-z0-9._-]*$", RegexOptions.CultureInvariant);
    private static readonly Regex Sha256Pattern = new(
        "^[0-9a-f]{64}$", RegexOptions.CultureInvariant);

    public static CapabilityPayloadManifest Load(Stream stream, CapabilitySetupManifest setupManifest)
    {
        ArgumentNullException.ThrowIfNull(stream);
        ArgumentNullException.ThrowIfNull(setupManifest);
        var manifest = CapabilitySetupJson.DeserializePayloadManifest(stream)
            ?? throw new InvalidDataException("payload-manifest-empty");
        manifest.Validate(setupManifest);
        return manifest;
    }

    public static CapabilityPayloadManifest LoadEmbedded(CapabilitySetupManifest setupManifest)
    {
        using var stream = typeof(CapabilityPayloadManifest).Assembly.GetManifestResourceStream(EmbeddedName)
            ?? throw new InvalidDataException("payload-manifest-missing");
        return Load(stream, setupManifest);
    }

    public void Validate(CapabilitySetupManifest setupManifest)
    {
        ArgumentNullException.ThrowIfNull(setupManifest);
        setupManifest.Validate();
        Require(SchemaVersion == 1, "payload-manifest-schema");
        Require(CapabilityId == setupManifest.CapabilityId, "payload-manifest-capability-id");
        Require(CapabilityVersion == setupManifest.CapabilityVersion, "payload-manifest-capability-version");
        Require(Files is { Length: > 0 and <= MaximumFiles }, "payload-manifest-file-count");

        long totalBytes = 0;
        var keys = new HashSet<string>(StringComparer.Ordinal);
        var orderedKeys = new List<string>(Files.Length);
        foreach (var file in Files)
        {
            Require(file.Length > 0 && file.Length <= MaximumTotalBytes, "payload-file-length");
            totalBytes = checked(totalBytes + file.Length);
            Require(totalBytes <= MaximumTotalBytes, "payload-total-length");
            Require(Sha256Pattern.IsMatch(file.Sha256), "payload-file-sha256");
            ValidateRelativePath(file.RelativePath);
            var key = $"{ComponentDirectory(file.Component)}/{file.RelativePath}";
            Require(keys.Add(key), "payload-file-duplicate");
            orderedKeys.Add(key);
        }

        Require(orderedKeys.SequenceEqual(orderedKeys.Order(StringComparer.Ordinal)), "payload-file-order");
        Require(keys.Contains("core/Cap7CE.Core.Host.exe"), "payload-core-entrypoint");
        Require(keys.Contains("reader/Cap7CE.Core.Reader.Host.exe"), "payload-reader-entrypoint");
    }

    public static string ComponentDirectory(CapabilityPayloadComponent component) => component switch
    {
        CapabilityPayloadComponent.Core => "core",
        CapabilityPayloadComponent.Reader => "reader",
        _ => throw new InvalidDataException("payload-component")
    };

    private static void ValidateRelativePath(string relativePath)
    {
        Require(!string.IsNullOrWhiteSpace(relativePath), "payload-file-path");
        Require(!Path.IsPathRooted(relativePath), "payload-file-rooted");
        Require(!relativePath.Contains('\\') && !relativePath.Contains(':'), "payload-file-separator");
        var segments = relativePath.Split('/', StringSplitOptions.None);
        Require(segments.All(segment => SegmentPattern.IsMatch(segment)
            && segment is not "." and not ".."), "payload-file-segment");
    }

    private static void Require(bool condition, string reason)
    {
        if (!condition) throw new InvalidDataException(reason);
    }
}
