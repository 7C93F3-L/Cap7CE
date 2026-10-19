using System.Text;
using System.Text.Json.Nodes;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataWorkers;

namespace Cap7CE.Core.Tests;

internal static class MetadataExtractorManifestTests
{
    public static async Task RunAsync()
    {
        var actual = await File.ReadAllBytesAsync(Path.Combine(FileFactExecutionTests.Resources.Root, "extractors.json"));
        var parsed = MetadataExtractorManifest.Parse(actual);
        TestAssert.Equal(9, parsed.Count, "generated manifest covers every current Core kind exactly once");
        TestAssert.True(Enum.GetValues<FileFactKind>().All(kind => parsed.Any(item => item.Kind == kind)), "complete kind set");
        foreach (var text in new[] { "null", "[]", "false", "{\"version\":\"1\"}", "{\"version\":1,\"version\":1,\"specifications\":[]}", "{\"version\":1,\"specifications\":null}", new string(' ', MetadataExtractorManifest.MaximumBytes + 1) })
            await InvalidAsync(Encoding.UTF8.GetBytes(text));
        var changes = new Action<JsonNode>[] {
            value => value["version"] = 2, value => value["future"] = true,
            value => value["specifications"]!.AsArray().RemoveAt(0), value => value["specifications"]!.AsArray()[0] = null,
            value => value["specifications"]![0]!["kind"] = 9, value => value["specifications"]![0]!["kind"] = 1,
            value => value["specifications"]![0]!["extractorVersion"] = 0, value => value["specifications"]![0]!["extractorVersion"] = "2",
            value => value["specifications"]![0]!["extensions"] = new JsonArray(), value => value["specifications"]![0]!["extensions"] = null,
            value => value["specifications"]![0]!["extensions"]![0] = ".bad/slash", value => value["specifications"]![0]!["extensions"]![0] = null
        };
        foreach (var change in changes) { var value = JsonNode.Parse(actual)!; change(value); await InvalidAsync(Encoding.UTF8.GetBytes(value.ToJsonString())); }
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-extractor-manifest-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try {
            await TestAssert.ThrowsAsync<InvalidOperationException>(() => MetadataExtractorManifest.LoadAsync(root), "missing manifest fails closed");
            var path = Path.Combine(root, "extractors.json"); await File.WriteAllBytesAsync(path, actual);
            TestAssert.Equal(9, (await MetadataExtractorManifest.LoadAsync(root)).Count, "standalone copied application resource");
            using (var cancel = new CancellationTokenSource()) {
                cancel.Cancel(); await TestAssert.ThrowsAsync<OperationCanceledException>(() => MetadataExtractorManifest.LoadAsync(root, cancel.Token), "cancelled manifest read");
            }
            await File.WriteAllBytesAsync(path, new byte[MetadataExtractorManifest.MaximumBytes + 1]);
            await TestAssert.ThrowsAsync<InvalidOperationException>(() => MetadataExtractorManifest.LoadAsync(root), "bounded resource read");
            TestAssert.Equal((long)MetadataExtractorManifest.MaximumBytes + 1, new FileInfo(path).Length, "rejection never rewrites resource");
            TestAssert.Equal(1, Directory.GetFiles(root).Length, "manifest reading creates no tasks/configuration");
        }
        finally {
            TestAssert.True(Path.GetFullPath(root).StartsWith(Path.GetTempPath(), StringComparison.OrdinalIgnoreCase) && Path.GetFileName(root).StartsWith("Cap7CE-extractor-manifest-", StringComparison.Ordinal), "owned fixture cleanup");
            Directory.Delete(root, recursive: true);
        }
    }
    private static async Task InvalidAsync(byte[] bytes)
    {
        try { MetadataExtractorManifest.Parse(bytes); throw new Exception("invalid manifest accepted"); }
        catch (InvalidOperationException error) { TestAssert.Equal("metadata-build-invalid-specification", error.Message, "bounded manifest error"); }
        await Task.CompletedTask;
    }
}
