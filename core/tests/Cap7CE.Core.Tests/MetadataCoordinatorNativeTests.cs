using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host;
using Cap7CE.Core.Host.MetadataBuild;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Host.MetadataScheduling;
using Cap7CE.Core.Host.MetadataWorkers;

namespace Cap7CE.Core.Tests;

internal static class MetadataCoordinatorNativeTests
{
    public static async Task RunAsync()
    {
        if (!OperatingSystem.IsWindows()) return;
        var reader = new Counter(new NodeMetadataWorker(FileFactExecutionTests.Resources));
        await using var fixture = await FileFactExecutionTests.Fixture.CreateAsync(reader);
        await using var catalog = new ProductCoreRuntime(new CatalogV2Database(fixture.Database), new NoReader());
        var session = await fixture.Session.AttachBuildOwnerAsync();
        var root = Path.GetDirectoryName(fixture.Source)!; var config = Path.Combine(root, "configuration");
        var preferences = new MetadataBuildPreferencesFile(config); var directory = new MetadataDirectoryQueueFile(config);
        var specifications = await MetadataExtractorManifest.LoadAsync(FileFactExecutionTests.Resources.Root);
        var global = new MetadataGlobalBuildOwner(session, catalog, new(preferences), specifications, yieldMilliseconds: 0, waitMilliseconds: 2);
        var owner = new MetadataBuildCoordinator(global, session, catalog, directory, specifications, yieldMilliseconds: 0, waitMilliseconds: 2);
        var original = await File.ReadAllBytesAsync(fixture.Source);
        TestAssert.Equal("idle", (await owner.ReadAsync()).Progress.Phase, "real status remains dormant");
        TestAssert.False(Directory.Exists(config), "real status never creates grants");
        var policy = new FileFactQueuePolicy([fixture.Identity.VolumeId], [new(fixture.Identity.VolumeId)], []);
        await owner.SavePolicyAsync(policy); await owner.RestoreAsync(); await owner.NotifyCatalogChangeAsync();
        TestAssert.Equal(0, reader.Reads, "configuration and restored configuration never start actual decoder");
        await owner.StartDirectoryAsync(new(root, true));
        await UntilAsync(async () => (await owner.ReadAsync()).DirectoryTask is null && reader.Reads == 1);
        TestAssert.False((await preferences.LoadAsync())!.Value.GetProperty("consent").GetBoolean(), "directory execution preserves configured global consent");
        TestAssert.Equal(0, (await directory.LoadAsync())!.Value.GetProperty("jobs").GetArrayLength(), "real completed queue is durable");
        var version = specifications.Single(item => item.Kind == FileFactKind.TextData).ExtractorVersion;
        var fact = await new FileFactDatabase(fixture.Database).ReadCurrentAsync(fixture.Identity, FileFactKind.TextData, version);
        TestAssert.Equal(6L, fact!.TextDataProperties!.CharacterCount!.Value, "real directory scope publishes actual independent Node result");
        await owner.StartAsync(new(true, policy)); await UntilAsync(async () => (await owner.ReadAsync()).Progress.Phase == "completed");
        TestAssert.Equal(1, reader.Reads, "global sweep reuses directory facts rather than reopening source");
        await owner.PauseAsync(); await owner.ShutdownAsync();
        TestAssert.Equal("paused", (await preferences.LoadAsync())!.Value.GetProperty("intent").GetString(), "real manual pause is durable");
        TestAssert.True(original.SequenceEqual(await File.ReadAllBytesAsync(fixture.Source)), "real coordinator never changes source bytes");
        Console.WriteLine("Core coordinator native path: existing Catalog scope, real legacy JSON files, explicit directory grant, independent Node publication, global fact reuse and durable pause passed.");
    }
    private static async Task UntilAsync(Func<Task<bool>> condition)
    {
        for (var step = 0; step < 2000; step++) { if (await condition()) return; await Task.Delay(3); }
        throw new InvalidOperationException("native metadata coordinator test did not complete");
    }
    private sealed class Counter(IFileFactContentReader inner) : IFileFactContentReader
    {
        private int reads;
        internal int Reads => Volatile.Read(ref reads);
        public Task<FileFactExtractionResult> ReadAsync(FileFactExtractionTicket ticket, CancellationToken token) { Interlocked.Increment(ref reads); return inner.ReadAsync(ticket, token); }
        public Task ReleaseAsync() => inner.ReleaseAsync();
        public ValueTask DisposeAsync() => inner.DisposeAsync();
    }
    private sealed class NoReader : ICatalogReaderSessionFactory
    {
        public Task<ICatalogReaderSession> ConnectAsync(CancellationToken token) => throw new InvalidOperationException("test must not connect product Reader");
    }
}
