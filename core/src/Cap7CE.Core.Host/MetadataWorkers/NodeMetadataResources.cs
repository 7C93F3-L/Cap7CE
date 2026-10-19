using System.Security.Cryptography;

namespace Cap7CE.Core.Host.MetadataWorkers;

public sealed record NodeMetadataResources(string Root, string VideoHelper)
{
    public const string NodeSha256 = "3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5";
    public string Executable => Path.Combine(Root, "node.exe");
    public string Worker => Path.Combine(Root, "worker.cjs");
    public static NodeMetadataResources? FromEnvironment()
    {
        var root = Environment.GetEnvironmentVariable("CAP7CE_METADATA_RUNTIME_ROOT");
        var helper = Environment.GetEnvironmentVariable("CAP7CE_METADATA_VIDEO_HELPER");
        return root is null || helper is null ? null : new(root, helper);
    }
    public async Task VerifyAsync(CancellationToken token)
    {
        foreach (var value in new[] { Root, VideoHelper })
            if (!Path.IsPathFullyQualified(value) || value.Length > 32767 || value.Contains('\0')
                || value.StartsWith("\\\\", StringComparison.Ordinal)) throw new InvalidOperationException("metadata-worker-resources-invalid");
        if (!File.Exists(Worker)) throw new InvalidOperationException("metadata-worker-resources-missing");
        await using var stream = File.OpenRead(Executable);
        if (Convert.ToHexStringLower(await SHA256.HashDataAsync(stream, token)) != NodeSha256)
            throw new InvalidOperationException("metadata-worker-runtime-mismatch");
    }
}
