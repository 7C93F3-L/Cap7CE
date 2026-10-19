using System.Text;
using Cap7CE.Core.Configuration;

namespace Cap7CE.Core.Tests;

internal static class FavoriteConfigurationTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-Favorite-Core-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); var path = Path.Combine(root, "favorites.json");
        var file = new FavoriteConfigurationFile(path); var registry = new FavoriteDirectoryRegistry(file);
        try
        {
            TestAssert.Equal(0, (await registry.ExecuteAsync("list")).Count, "missing state is empty");
            TestAssert.False(File.Exists(path), "listing does not create a configuration");
            var items = await registry.ExecuteAsync("add", path: "x:/Assets/./a/../", name: "  素材  ");
            TestAssert.Equal("X:\\Assets", items[0].Path, "same path normalization as existing Windows client");
            TestAssert.Equal("素材", items[0].Name, "name trimming");
            var id = items[0].Id;
            await Task.WhenAll(registry.ExecuteAsync("add", path: "Y:\\"), registry.ExecuteAsync("add", path: "Z:\\Nested"));
            TestAssert.Equal(3, (await registry.ExecuteAsync("add", path: "X:\\ASSETS", name: "ignored")).Count, "duplicate is a no-op");
            await registry.ExecuteAsync("rename", id, name: "kept");
            await registry.ExecuteAsync("move", id, direction: "down");
            var reopened = new FavoriteDirectoryRegistry(new(path));
            TestAssert.Equal(id, (await reopened.ExecuteAsync("list"))[1].Id, "restart retains IDs and ordering");
            await registry.ExecuteAsync("relocate", oldPath: "X:\\Assets", newPath: "X:\\Moved");
            TestAssert.Equal("Moved", (await registry.ExecuteAsync("list"))[1].Name, "relocation retains previous naming rule");
            var preserved = await File.ReadAllBytesAsync(path);
            using (var locked = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                var rejected = false;
                try { await registry.ExecuteAsync("add", path: "C:\\Denied"); }
                catch (Exception error) when (error is IOException or UnauthorizedAccessException) { rejected = true; }
                TestAssert.True(rejected, "locked destination rejects atomic replace");
            }
            TestAssert.True(preserved.SequenceEqual(await File.ReadAllBytesAsync(path)), "failed replacement preserves state bytes");
            TestAssert.Equal(1, Directory.GetFiles(root).Length, "failed publication cleans only its own stage");
            var collision = path + ".collision.pending"; await File.WriteAllTextAsync(collision, "owned by another writer");
            var collisionFile = new FavoriteConfigurationFile(path) { CreateTemporaryPath = () => collision };
            await TestAssert.ThrowsAsync<IOException>(() => new FavoriteDirectoryRegistry(collisionFile).ExecuteAsync("add", path: "C:\\Collision"), "exclusive staging collision");
            TestAssert.Equal("owned by another writer", await File.ReadAllTextAsync(collision), "never delete a file not exclusively created");
            File.Delete(collision);
            using (var cancel = new CancellationTokenSource())
            {
                cancel.Cancel(); await TestAssert.ThrowsAsync<OperationCanceledException>(() => registry.ExecuteAsync("remove", id, token: cancel.Token), "cancelled edit");
            }
            TestAssert.True(preserved.SequenceEqual(await File.ReadAllBytesAsync(path)), "cancelled edit preserves state");
            using (FavoriteConfigurationLease.Acquire(path))
                TestAssert.ThrowsAsync<FavoriteConfigurationException>(() => Task.Run(() => FavoriteConfigurationLease.Acquire(path)), "second process ownership rejected").GetAwaiter().GetResult();
            using (FavoriteConfigurationLease.Acquire(path)) { }
            foreach (var invalid in new[] { "{broken", "{\"version\":1,\"directories\":[],\"extra\":true}", "{\"version\":1,\"directories\":[null]}", new string(' ', FavoriteDirectoryRules.MaximumBytes + 1) })
            {
                await File.WriteAllTextAsync(path, invalid, new UTF8Encoding(false));
                await TestAssert.ThrowsAsync<Exception>(() => registry.ExecuteAsync("add", path: "C:\\Bad"), "invalid state blocks writes");
                TestAssert.Equal(invalid, await File.ReadAllTextAsync(path), "malformed state is never overwritten");
            }
            await File.WriteAllBytesAsync(path, [0xff]);
            await TestAssert.ThrowsAsync<DecoderFallbackException>(() => registry.ExecuteAsync("list"), "strict UTF8");
            await File.WriteAllBytesAsync(path, preserved);
            var source = Path.Combine(root, "source.bin"); await File.WriteAllTextAsync(source, "untouched");
            await registry.ExecuteAsync("remove", id);
            TestAssert.Equal("untouched", await File.ReadAllTextAsync(source), "configuration removal never touches an asset");
            var maximum = Enumerable.Range(0, 256).Select(n => new FavoriteDirectory(Guid.NewGuid().ToString("D"), $"X:\\{n}", n.ToString())).ToArray();
            await file.WriteAsync(maximum, default);
            await TestAssert.ThrowsAsync<FavoriteConfigurationException>(() => registry.ExecuteAsync("add", path: "X:\\limit"), "entry count bound");
            TestAssert.Equal(256, (await registry.ExecuteAsync("list")).Count, "limit rejection retains every entry");
            TestAssert.Equal("x:\\ος", FavoriteDirectoryRules.Key("X:\\ΟΣ"), "ECMAScript final sigma");
            TestAssert.Equal("i\u0307", FavoriteDirectoryRules.Key("İ"), "ECMAScript expanded lowercase");
        }
        finally
        {
            TestAssert.True(Path.GetFullPath(root).StartsWith(Path.GetTempPath(), StringComparison.OrdinalIgnoreCase)
                && Path.GetFileName(root).StartsWith("Cap7CE-Favorite-Core-", StringComparison.Ordinal), "fixture cleanup ownership");
            Directory.Delete(root, recursive: true);
        }
    }
}
