using System.Security.Cryptography;
using Cap7CE.Core.Setup;

namespace Cap7CE.Core.Tests;

internal static class CapabilitySetupPayloadTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), $"cap7ce-setup-payload-{Guid.NewGuid():N}");
        try
        {
            Directory.CreateDirectory(Path.Combine(root, "core"));
            Directory.CreateDirectory(Path.Combine(root, "reader"));
            var coreBytes = "synthetic-core"u8.ToArray();
            var readerBytes = "synthetic-reader"u8.ToArray();
            await File.WriteAllBytesAsync(Path.Combine(root, "core", "Cap7CE.Core.Host.exe"), coreBytes);
            await File.WriteAllBytesAsync(Path.Combine(root, "reader", "Cap7CE.Core.Reader.Host.exe"), readerBytes);

            var setupManifest = CapabilitySetupManifest.LoadEmbedded();
            var manifest = CreateManifest(setupManifest, coreBytes, readerBytes);
            var verified = await CapabilitySetupPayloadVerifier.VerifyAsync(root, manifest, setupManifest);
            TestAssert.Equal(coreBytes.Length + readerBytes.Length, verified.TotalBytes,
                "verified payload aggregate bytes");

            await TestHashMismatchAsync(root, manifest, setupManifest);
            await TestUnlistedFileAsync(root, manifest, setupManifest);
            TestInvalidManifestPaths(setupManifest, manifest);
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    private static CapabilityPayloadManifest CreateManifest(
        CapabilitySetupManifest setupManifest,
        byte[] coreBytes,
        byte[] readerBytes) => new(
            1,
            setupManifest.CapabilityId,
            setupManifest.CapabilityVersion,
            [
                new(CapabilityPayloadComponent.Core, "Cap7CE.Core.Host.exe", coreBytes.Length, Sha256(coreBytes)),
                new(CapabilityPayloadComponent.Reader, "Cap7CE.Core.Reader.Host.exe", readerBytes.Length, Sha256(readerBytes))
            ]);

    private static async Task TestHashMismatchAsync(
        string root,
        CapabilityPayloadManifest manifest,
        CapabilitySetupManifest setupManifest)
    {
        var damaged = manifest with
        {
            Files = [manifest.Files[0] with { Sha256 = new string('0', 64) }, manifest.Files[1]]
        };
        await ExpectInvalidDataAsync(
            () => CapabilitySetupPayloadVerifier.VerifyAsync(root, damaged, setupManifest).AsTask(),
            "payload-file-hash-mismatch", "payload hash mismatch rejection");
    }

    private static async Task TestUnlistedFileAsync(
        string root,
        CapabilityPayloadManifest manifest,
        CapabilitySetupManifest setupManifest)
    {
        var extraPath = Path.Combine(root, "reader", "extra.dll");
        await File.WriteAllBytesAsync(extraPath, "unlisted"u8.ToArray());
        await ExpectInvalidDataAsync(
            () => CapabilitySetupPayloadVerifier.VerifyAsync(root, manifest, setupManifest).AsTask(),
            "payload-unlisted-file", "unlisted payload file rejection");
        File.Delete(extraPath);
    }

    private static void TestInvalidManifestPaths(
        CapabilitySetupManifest setupManifest,
        CapabilityPayloadManifest manifest)
    {
        var traversal = manifest with
        {
            Files = [manifest.Files[0] with { RelativePath = "../outside.exe" }, manifest.Files[1]]
        };
        ExpectInvalidData(() => traversal.Validate(setupManifest), "payload-file-segment",
            "payload traversal rejection");

        var duplicate = manifest with { Files = [manifest.Files[0], manifest.Files[0], manifest.Files[1]] };
        ExpectInvalidData(() => duplicate.Validate(setupManifest), "payload-file-duplicate",
            "duplicate payload destination rejection");
    }

    private static string Sha256(byte[] bytes) =>
        Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

    private static void ExpectInvalidData(Action action, string reason, string description)
    {
        try
        {
            action();
            throw new InvalidOperationException($"{description} was accepted");
        }
        catch (InvalidDataException exception)
        {
            TestAssert.Equal(reason, exception.Message, description);
        }
    }

    private static async Task ExpectInvalidDataAsync(Func<Task> action, string reason, string description)
    {
        try
        {
            await action();
            throw new InvalidOperationException($"{description} was accepted");
        }
        catch (InvalidDataException exception)
        {
            TestAssert.Equal(reason, exception.Message, description);
        }
    }
}
