using System.Text.Json;
using Cap7CE.Core.Host.MetadataBuild;

namespace Cap7CE.Core.Tests;

internal static class MetadataBuildStateFileTests
{
    private const string Volume = "0123456789abcdef0123456789ABCDEF";
    private static JsonElement Preferences(string intent = "configured") => JsonSerializer.SerializeToElement(new {
        version = 2, intent, consent = intent != "configured",
        policy = new { volumeOrder = new[] { Volume }, includes = new[] { new { volumeId = Volume, rootFileReference = (string?)null } }, excludes = Array.Empty<object>() },
        scopeLabels = new Dictionary<string, string> { [Volume + ":root"] = "Z:\\素材" }, future = new { retained = "unknown field" }
    });
    private static JsonElement Queue(string path = "Z:\\素材") => JsonSerializer.SerializeToElement(new { version = 1, intent = "paused", jobs = new[] { new { path } } });
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-Metadata-State-" + Guid.NewGuid().ToString("N"));
        var preferences = new MetadataBuildPreferencesFile(root); var queue = new MetadataDirectoryQueueFile(root);
        try
        {
            TestAssert.True(await preferences.LoadAsync() is null && await queue.LoadAsync() is null, "missing grants stay absent");
            TestAssert.False(Directory.Exists(root), "passive read never creates state directories");
            foreach (var intent in new[] { "configured", "active", "paused", "completed" }) {
                await preferences.SaveAsync(Preferences(intent));
                var loaded = (await new MetadataBuildPreferencesFile(root).LoadAsync())!.Value;
                TestAssert.Equal(intent, loaded.GetProperty("intent").GetString(), "legacy intent round trip");
                TestAssert.Equal("unknown field", loaded.GetProperty("future").GetProperty("retained").GetString(), "unknown members retained");
            }
            await queue.SaveAsync(Queue());
            var queuePath = Path.Combine(root, "metadata-directory-build.json");
            var preferencesPath = Path.Combine(root, "metadata-build.json");
            var original = await File.ReadAllBytesAsync(queuePath);
            using (var locked = new FileStream(queuePath, FileMode.Open, FileAccess.Read, FileShare.Read)) {
                try { await queue.SaveAsync(Queue("Y:\\Other")); throw new InvalidOperationException("expected replace failure"); }
                catch (MetadataDirectoryStateException error) {
                    TestAssert.Equal("replace", error.Details.Operation, "replace failure phase");
                    TestAssert.True(error.Details.Code is "EBUSY" or "EACCES", "Windows reports sharing conflict or denied atomic rename");
                    TestAssert.Equal("metadata-directory-state-unavailable", error.Message, "no path in public error");
                }
            }
            TestAssert.True(original.SequenceEqual(await File.ReadAllBytesAsync(queuePath)), "failed replace preserves old grant");
            TestAssert.Equal(2, Directory.GetFiles(root).Length, "only exclusively created stage removed");
            var collision = queuePath + ".foreign.tmp"; await File.WriteAllTextAsync(collision, "foreign stage");
            var collisionQueue = new MetadataDirectoryQueueFile(new MetadataStateFile(queuePath) { CreateTemporaryPath = () => collision });
            await TestAssert.ThrowsAsync<MetadataDirectoryStateException>(() => collisionQueue.SaveAsync(Queue()), "exclusive stage collision");
            TestAssert.Equal("foreign stage", await File.ReadAllTextAsync(collision), "foreign stage retained");
            File.Delete(collision);
            using (var cancel = new CancellationTokenSource()) {
                cancel.Cancel(); await TestAssert.ThrowsAsync<OperationCanceledException>(() => queue.SaveAsync(Queue(), cancel.Token), "cancel before publication");
            }
            TestAssert.True(original.SequenceEqual(await File.ReadAllBytesAsync(queuePath)), "cancel does not alter grant");
            foreach (var invalid in new[] { "null", "[]", "{broken", "{\"version\":\"1\"}", "{\"version\":true}", "{\"version\":3}", new string(' ', MetadataStateFile.MaximumBytes + 1) }) {
                await File.WriteAllTextAsync(preferencesPath, invalid);
                TestAssert.True(await preferences.LoadAsync() is null, "invalid preferences ignored passively");
                TestAssert.Equal(invalid, await File.ReadAllTextAsync(preferencesPath), "invalid preferences preserved");
                await File.WriteAllTextAsync(queuePath, invalid);
                await TestAssert.ThrowsAsync<MetadataDirectoryStateException>(() => queue.LoadAsync(), "invalid directory queue reported");
                TestAssert.Equal(invalid, await File.ReadAllTextAsync(queuePath), "invalid queue preserved");
            }
            await File.WriteAllBytesAsync(queuePath, original);
            var unicode = JsonSerializer.SerializeToElement(new { version = 1, intent = "paused", jobs = Array.Empty<object>(), future = new string('中', 200000) });
            await queue.SaveAsync(unicode);
            TestAssert.True(new FileInfo(queuePath).Length < 700000, "UTF8 budget does not expand ordinary Unicode to ASCII escapes");
            TestAssert.Equal(200000, (await queue.LoadAsync())!.Value.GetProperty("future").GetString()!.Length, "unknown Unicode field preserved");
            await Task.WhenAll(Enumerable.Range(0, 24).Select(async index => {
                await queue.SaveAsync(Queue($"Z:\\{index}"));
                TestAssert.True(await queue.LoadAsync() is not null, "concurrent readers never see partial JSON");
            }));
            var tooMany = JsonSerializer.SerializeToElement(new { version = 1, intent = "active", jobs = Enumerable.Repeat(new { path = "Z:\\" }, 33) });
            await TestAssert.ThrowsAsync<MetadataDirectoryStateException>(() => queue.SaveAsync(tooMany), "directory job budget");
            var oversized = JsonSerializer.SerializeToElement(new { version = 1, intent = "active", jobs = Array.Empty<object>(), future = new string('x', MetadataStateFile.MaximumBytes) });
            await TestAssert.ThrowsAsync<MetadataDirectoryStateException>(() => queue.SaveAsync(oversized), "serialized byte budget");
            ValidateShapes();
            TestAssert.Equal(2, Directory.GetFiles(root).Length, "no parser, source content, Catalog or cache files created");
        }
        finally {
            TestAssert.True(Path.GetFullPath(root).StartsWith(Path.GetTempPath(), StringComparison.OrdinalIgnoreCase)
                && Path.GetFileName(root).StartsWith("Cap7CE-Metadata-State-", StringComparison.Ordinal), "owned fixture root");
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }
    private static void ValidateShapes()
    {
        foreach (var (input, expected) in new[] { ("c:/素材//a/../", "c:\\素材"), ("C:/../../", "C:\\"), ("Z:\\a\\.\\b", "Z:\\a\\b"), ("z:\\\\", "z:\\"), ("C:/a.../ ", "C:\\a...\\ ") })
            TestAssert.Equal(expected, MetadataDirectoryPath.Normalize(input), "legacy win32 path normalization");
        foreach (var path in new[] { "Z:/not-canonical", "Z:\\trailing\\", "Z:\\a\\..\\b", "\\\\server\\share", "Z:\\bad:stream", "Z:\\bad?", "Z:\\nul\0" })
            TestAssert.False(MetadataBuildStateSchema.DirectoryQueue(Queue(path)), "invalid or noncanonical job path rejected");
        foreach (var raw in new[] { "null", "[]", "false", "{\"version\":null}", "{\"version\":\"2\"}", "{\"version\":2,\"intent\":\"configured\",\"consent\":true}" }) {
            using var document = JsonDocument.Parse(raw);
            TestAssert.False(MetadataBuildStateSchema.Preferences(document.RootElement), "ill-typed state returns false");
        }
        foreach (var scope in new[] { "null", "false", "0", "\"\"" }) {
            using var document = JsonDocument.Parse("{\"version\":1,\"intent\":\"paused\",\"jobs\":[{\"path\":\"Z:\\\\\",\"scope\":" + scope + "}]}");
            TestAssert.True(MetadataBuildStateSchema.DirectoryQueue(document.RootElement), "legacy absent scope accepted");
        }
    }
}
