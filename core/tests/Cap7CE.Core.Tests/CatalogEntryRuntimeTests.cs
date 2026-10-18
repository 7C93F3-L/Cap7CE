using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Cap7CE.Core.Host;
using Cap7CE.Core.Host.CatalogStorage;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogEntryRuntimeTests
{
    public static async Task RunAsync()
    {
        using var fixture = new TemporaryCatalogFixture(); var path = fixture.DatabasePath;
        var catalog = new CatalogV2Database(path); var entries = new EntryCatalogReaderFixture();
        entries.Overrides[11] = EntryCatalogReaderFixture.Names(new(10, "alpha.png"), new(5, "alias.png"));
        var waiting = new WaitingCatalogReader(entries);
        string volumeId;
        await using (var runtime = new ProductCoreRuntime(catalog, waiting, ownStorage: true, createEntryCatalog: true)) {
            await Task.WhenAll(runtime.InitializeAsync(), runtime.InitializeAsync());
            TestAssert.True(runtime.FileEntryModeEnabled, "brand-new product storage initializes entry mode atomically");
            TestAssert.Equal(0L, await catalog.ReadRevisionAsync(), "new entry storage starts at the initial Catalog revision");
            await using (var competing = new ProductCoreRuntime(new(path), waiting, ownStorage: true))
                await TestAssert.ThrowsAsync<IOException>(() => competing.InitializeAsync(), "second product owner cannot attach");
            await TestAssert.ThrowsAsync<IOException>(() => new CatalogEntryMaintenance(path, Path.Combine(Path.GetDirectoryName(path)!, "recovery")).UpgradeAsync(), "live product owner blocks offline maintenance");
            var volumes = await runtime.DiscoverVolumesAsync(CancellationToken.None);
            volumeId = volumes.Volumes.Single(v => v.DisplayName == "A:").VolumeId;
            await runtime.SelectVolumesAsync(new([volumeId]), CancellationToken.None);
            await WaitTaskAsync(runtime, runtime.StartSynchronization(new([volumeId]), false), "completed");
            var identity = new CatalogEntryIdentity(volumeId, "000000000000000B");
            TestAssert.Equal(2, (await new CatalogFileEntryStore(catalog).ReadAsync(identity))!.Entries.Count, "product initial build captures both names");
            await runtime.ActivateMaintenanceAsync((_, _) => Task.FromResult<IReadOnlyList<FileFactOwnedStorageRoot>>([]));
            await waiting.Waits.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(10));
            TestAssert.Equal("watching", runtime.ChangeSignal.Snapshot.State, "entry-aware product monitor is active");
            entries.Base.RenameAndMove("A:", 11, 5, "renamed.png");
            entries.Overrides[11] = EntryCatalogReaderFixture.Names(new Cap7CE.Core.Reader.Protocol.ReaderFileName(5, "renamed.png"))
                with { LastWriteFileTimeUtc = 133_000_000_000_000_021 };
            waiting.Pulses.Writer.TryWrite(false);
            await waiting.Waits.Reader.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(10));
            var current = (await new CatalogFileEntryStore(catalog).ReadAsync(identity))!;
            TestAssert.Equal("renamed.png", current.Entries.Single().Name, "product live monitor publishes the complete new name set");
            TestAssert.Equal(1, waiting.MaximumActive, "product synchronization and entry monitor share the existing Reader owner");
            await runtime.ShutdownAsync();
            TestAssert.Equal(0, waiting.Active, "shutdown fully retires Reader sessions");
            await TestAssert.ThrowsAsync<IOException>(() => { using var unexpected = CatalogStorageLease.Acquire(path); return Task.CompletedTask; }, "storage lease lasts through runtime disposal");
        }
        using (CatalogStorageLease.Acquire(path)) { }
        await using (var reopened = new ProductCoreRuntime(new(path), waiting, ownStorage: true)) {
            await reopened.InitializeAsync();
            TestAssert.True(reopened.FileEntryModeEnabled, "restart derives entry mode from storage without a transient flag");
            await WaitTaskAsync(reopened, reopened.StartSynchronization(new([volumeId]), true), "completed");
        }
        var oldReader = new WaitingCatalogReader(entries.Base);
        await using (var incompatible = new ProductCoreRuntime(new(path), oldReader, ownStorage: true)) {
            await incompatible.InitializeAsync(); var revision = await incompatible.Catalog.ReadRevisionAsync();
            var failure = await WaitTaskAsync(incompatible, incompatible.StartSynchronization(new([volumeId]), false), "failed");
            TestAssert.Equal("reader-repair-required", failure.ErrorCode!, "old Reader requires repair rather than legacy fallback");
            TestAssert.Equal(revision, await incompatible.Catalog.ReadRevisionAsync(), "missing capability never changes readiness/checkpoint");
            await incompatible.ActivateMaintenanceAsync((_, _) => Task.FromResult<IReadOnlyList<FileFactOwnedStorageRoot>>([]));
            for (var attempt = 0; incompatible.ChangeSignal.Snapshot.State == "starting" && attempt < 200; attempt++) await Task.Delay(10);
            TestAssert.Equal("reader-entry-names-unavailable", incompatible.ChangeSignal.Snapshot.Reason!, "monitor reports the missing capability precisely");
            var connects = oldReader.Connects; await Task.Delay(30);
            TestAssert.Equal(connects, oldReader.Connects, "capability failure does not reconnect in an idle loop");
        }
        await ExistingLegacyAndFailedInitializationAsync();
    }
    private static async Task ExistingLegacyAndFailedInitializationAsync()
    {
        using var legacy = new TemporaryCatalogFixture(); var catalog = new CatalogV2Database(legacy.DatabasePath);
        await catalog.InitializeAsync();
        await using (var runtime = new ProductCoreRuntime(catalog, new SyntheticCatalogReader(), ownStorage: true, createEntryCatalog: true)) {
            await runtime.InitializeAsync();
            TestAssert.False(runtime.FileEntryModeEnabled, "existing format 2 is never upgraded by product startup, even if empty");
            TestAssert.Equal(0L, await catalog.ReadRevisionAsync(), "legacy startup preserves its revision");
        }
        using var invalid = new TemporaryCatalogFixture(); await File.WriteAllTextAsync(invalid.DatabasePath, "invalid-fixture");
        await using (var runtime = new ProductCoreRuntime(new(invalid.DatabasePath), new SyntheticCatalogReader(), ownStorage: true)) {
            await TestAssert.ThrowsAsync<SqliteException>(() => runtime.InitializeAsync(), "invalid Catalog cannot initialize");
            using (CatalogStorageLease.Acquire(invalid.DatabasePath)) { }
        }
        TestAssert.Equal("invalid-fixture", await File.ReadAllTextAsync(invalid.DatabasePath), "failed initialization preserves the input file");
    }
    private static async Task<CoreCatalogTaskStatus> WaitTaskAsync(ProductCoreRuntime runtime, CatalogBuildResponse build, string expected)
    {
        for (var attempt = 0; attempt < 500; attempt++) {
            var task = (await runtime.ReadStatusAsync(CancellationToken.None)).Tasks.Single(t => t.TaskId == build.TaskId);
            if (task.State != "running") { TestAssert.Equal(expected, task.State, "runtime task " + task.ErrorCode); return task; }
            await Task.Delay(10);
        }
        throw new TimeoutException("entry runtime fixture task");
    }
}
