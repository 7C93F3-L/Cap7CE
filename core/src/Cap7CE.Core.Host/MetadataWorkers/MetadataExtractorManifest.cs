using System.Text.Json;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Protocol;

namespace Cap7CE.Core.Host.MetadataWorkers;

// Fixed application resource only. The canonical versions/extensions come from the existing TypeScript definitions.
public static class MetadataExtractorManifest
{
    public const int MaximumBytes = 64 * 1024;
    private sealed record Manifest(int Version, IReadOnlyList<FileFactChangeSpecification> Specifications);
    public static async Task<IReadOnlyList<FileFactChangeSpecification>> LoadAsync(string runtimeRoot, CancellationToken token = default)
    {
        if (!Path.IsPathFullyQualified(runtimeRoot) || runtimeRoot.Length > 32767 || runtimeRoot.Contains('\0') || runtimeRoot.StartsWith("\\\\", StringComparison.Ordinal)) throw Invalid();
        try {
            await using var input = new FileStream(Path.Combine(runtimeRoot, "extractors.json"), FileMode.Open, FileAccess.Read, FileShare.Read, 4096, FileOptions.Asynchronous);
            var bytes = new byte[MaximumBytes + 1]; var length = 0;
            while (length < bytes.Length) { var count = await input.ReadAsync(bytes.AsMemory(length), token); if (count == 0) break; length += count; }
            return Parse(bytes.AsMemory(0, length));
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException) { throw Invalid(); }
    }
    public static IReadOnlyList<FileFactChangeSpecification> Parse(ReadOnlyMemory<byte> bytes)
    {
        try {
            if (bytes.Length > MaximumBytes) throw Invalid();
            using var document = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 32 });
            NodeMetadataJson.Validate(document.RootElement);
            var manifest = document.RootElement.Deserialize<Manifest>(CoreProtocolJson.Options);
            if (manifest?.Version != 1) throw Invalid();
            return MetadataScheduling.MetadataBuildSpecifications.Copy(manifest.Specifications, requireComplete: true);
        }
        catch (JsonException) { throw Invalid(); }
    }
    private static InvalidOperationException Invalid() => new("metadata-build-invalid-specification");
}
