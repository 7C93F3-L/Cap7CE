using System.Diagnostics;
using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Host;
using Cap7CE.Core.Protocol;
using Cap7CE.Core.Reader.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogV2Tests
{
    public static async Task<CatalogPathStrategyReport> RunAsync()
    {
        await RejectsInPlaceV1UpgradeAsync();
        await RunsMultiVolumeVerticalSliceAsync();
        await RunsProductSc1Async();
        return ComparePathStrategies();
    }

    private static async Task RejectsInPlaceV1UpgradeAsync()
    {
        using var root = new TemporaryRoot();
        var legacy = new CatalogDatabase(root.DatabasePath);
        await legacy.InitializeAsync();
        await TestAssert.ThrowsAsync<CatalogSchemaException>(
            () => new CatalogV2Database(root.DatabasePath).InitializeAsync(),
            "catalog v2 must rebuild rather than mutate a v1 catalog");
    }

    private static async Task RunsMultiVolumeVerticalSliceAsync()
    {
        using var root = new TemporaryRoot();
        var reader = new SyntheticCatalogReader();
        var database = new CatalogV2Database(root.DatabasePath);
        var abandonedSnapshot = root.DatabasePath + ".snapshot-" + Guid.NewGuid().ToString("N") + ".db";
        await File.WriteAllTextAsync(abandonedSnapshot, "disposable");
        await using (var runtime = new ProductCoreRuntime(database, reader))
        {
            await runtime.InitializeAsync();
            TestAssert.False(File.Exists(abandonedSnapshot),
                "catalog initialization must remove an abandoned disposable snapshot build");
            var discovered = await runtime.DiscoverVolumesAsync(CancellationToken.None);
            TestAssert.Equal(2, discovered.Volumes.Count, "CR/2 synthetic volume discovery");
            var discoveryRevision = await database.ReadRevisionAsync();
            _ = await runtime.DiscoverVolumesAsync(CancellationToken.None);
            TestAssert.Equal(discoveryRevision, await database.ReadRevisionAsync(),
                "unchanged discovery must not invalidate product cursors");
            await runtime.SelectVolumesAsync(
                new VolumeSelectionRequest(discovered.Volumes.Select(volume => volume.VolumeId).ToArray()),
                CancellationToken.None);
            reader.FailNextSnapshotRead = true;
            var interrupted = await WaitForTaskAsync(
                runtime,
                runtime.StartSynchronization(new CatalogBuildRequest([]), false).TaskId,
                "failed");
            TestAssert.Equal("io-failure", interrupted.ErrorCode,
                "Reader interruption must return a bounded product task failure");
            TestAssert.False((await FindVolumeAsync(runtime, "A:")).Queryable,
                "interrupted initial build must not publish a partial Catalog");
            await RunTaskAsync(runtime, runtime.StartSynchronization(new CatalogBuildRequest([]), false));
            await AssertInitialQueriesAsync(database, discovered.Volumes);
            var snapshotCount = reader.SnapshotOpenCount;
            reader.Add("A:", new ReaderMftRecordV2(
                29, 10, 290, 132_000_000_000_000_029, 133_000_000_000_000_029,
                0x20, false, "transient-journal.psd", ".psd"));
            reader.FailNextJournalReadAsDiscontinuous = true;
            await RunTaskAsync(runtime, runtime.StartSynchronization(new CatalogBuildRequest([]), false));
            TestAssert.Equal(snapshotCount, reader.SnapshotOpenCount,
                "a transient discontinuity retries from fresh journal metadata without rebuilding");
            TestAssert.Equal(1, (await SearchAsync(database, "transient-journal", 20)).Items.Count,
                "the retried incremental pass applies the pending journal record");
            reader.Add("A:", new ReaderMftRecordV2(
                30, 10, 300, 132_000_000_000_000_030, 133_000_000_000_000_030,
                0x20, false, "bounded-current.psd", ".psd"));
            reader.AddDuringNextJournalRead("A:", new ReaderMftRecordV2(
                31, 10, 310, 132_000_000_000_000_031, 133_000_000_000_000_031,
                0x20, false, "bounded-later.psd", ".psd"));
            await RunTaskAsync(runtime, runtime.StartSynchronization(new CatalogBuildRequest([]), false));
            TestAssert.Equal(1, (await SearchAsync(database, "bounded-current", 20)).Items.Count,
                "incremental synchronization reaches its captured high-water mark");
            TestAssert.Equal(0, (await SearchAsync(database, "bounded-later", 20)).Items.Count,
                "changes created during synchronization wait for the next bounded pass");
            await RunTaskAsync(runtime, runtime.StartSynchronization(new CatalogBuildRequest([]), false));
            TestAssert.Equal(1, (await SearchAsync(database, "bounded-later", 20)).Items.Count,
                "the next synchronization resumes at the prior high-water mark");
        }

        reader.RenameAndMove("A:", 11, 5, "gamma.png");
        reader.Delete("A:", 12);
        reader.Add("A:", new ReaderMftRecordV2(
            13, 10, 333, 132_000_000_000_000_013, 133_000_000_000_000_013,
            0x20, false, "new.psd", ".psd"));

        await using (var reopened = new ProductCoreRuntime(new CatalogV2Database(root.DatabasePath), reader))
        {
            await reopened.InitializeAsync();
            await RunTaskAsync(reopened, reopened.StartSynchronization(new CatalogBuildRequest([]), false));
            var gamma = await SearchAsync(reopened.Catalog, "gamma", 20);
            TestAssert.Equal(1, gamma.Items.Count, "rename must keep one stable identity");
            TestAssert.Equal("gamma.png", gamma.Items[0].RelativePath, "move must update materialized directory path");
            TestAssert.Equal(0, (await SearchAsync(reopened.Catalog, "shared", 20,
                volumeIds: [(await FindVolumeAsync(reopened, "A:")).VolumeId])).Items.Count,
                "delete must not leave a live duplicate");
            var added = await SearchAsync(reopened.Catalog, "new.psd", 20);
            TestAssert.Equal("assets\\new.psd", added.Items.Single().RelativePath,
                "incremental add path");

            reader.SetOnline("B:", false);
            await RunTaskAsync(reopened, reopened.StartSynchronization(new CatalogBuildRequest([]), false));
            TestAssert.Equal("offline", (await FindVolumeAsync(reopened, "B:")).State,
                "offline volume state");
            reader.SetOnline("B:", true);
            reader.RenameAndMove("B:", 20, 21, "beta-moved.jpg");
            await RunTaskAsync(reopened, reopened.StartSynchronization(new CatalogBuildRequest([]), false));
            TestAssert.Equal("library\\beta-moved.jpg",
                (await SearchAsync(reopened.Catalog, "beta-moved", 20)).Items.Single().RelativePath,
                "online catch-up path");

            reader.BreakJournal("A:");
            reader.RenameAndMove("A:", 13, 10, "rebuilt.psd");
            await RunTaskAsync(reopened, reopened.StartSynchronization(new CatalogBuildRequest([]), false));
            TestAssert.Equal(1, (await SearchAsync(reopened.Catalog, "rebuilt", 20)).Items.Count,
                "journal discontinuity rebuild");
            var savedAfterRebuild = await reopened.Catalog.QueryAsync(new CatalogV2Query(
                "rebuilt", [], CatalogQueryScope.Saved("saved-assets"), ".psd",
                CatalogEntryType.File, 20, null));
            TestAssert.Equal(1, savedAfterRebuild.Items.Count,
                "snapshot publish must preserve saved scopes whose stable roots still exist");
            TestAssert.True(await reopened.Catalog.CheckIntegrityAsync(), "catalog v2 integrity");
        }
    }

    private static async Task AssertInitialQueriesAsync(
        CatalogV2Database database,
        IReadOnlyList<CoreVolumeStatus> discovered)
    {
        var page = await SearchAsync(database, "shared", 1);
        TestAssert.Equal(1, page.Items.Count, "cross-volume first page");
        TestAssert.True(page.Next is not null, "cross-volume continuation");
        var second = await database.QueryAsync(new CatalogV2Query(
            "shared", [], CatalogQueryScope.AllVolumes(), null,
            CatalogEntryType.Any, 1, page.Next));
        TestAssert.Equal(1, second.Items.Count, "cross-volume second page");
        TestAssert.False(page.Items[0].Identity == second.Items[0].Identity, "stable cross-volume identity");

        var volumeA = discovered.Single(volume => volume.DisplayName == "A:");
        var resolvedAssets = await database.ResolveDirectoryAsync(volumeA.VolumeId, "assets");
        TestAssert.True(resolvedAssets is not null, "directory path resolves to stable identity");
        TestAssert.Equal(CatalogV2Database.EncodeFileReference(10), resolvedAssets!.Identity.FileReference,
            "resolved directory identity");
        TestAssert.True(await database.ResolveDirectoryAsync(volumeA.VolumeId, "missing") is null,
            "unknown directory path does not resolve");
        var root = CatalogV2Database.EncodeFileReference(5);
        var children = await database.GetChildrenAsync(
            new CatalogEntryIdentity(volumeA.VolumeId, root), 20);
        TestAssert.Equal(2, children.Items.Count, "direct child query");
        var descendants = await database.QueryAsync(new CatalogV2Query(
            string.Empty,
            [volumeA.VolumeId],
            CatalogQueryScope.Descendants(volumeA.VolumeId, CatalogV2Database.EncodeFileReference(10)),
            null,
            CatalogEntryType.Any,
            20,
            null));
        var alpha = descendants.Items.Single();
        TestAssert.Equal("assets\\alpha.png", alpha.RelativePath, "directory descendant path");
        TestAssert.Equal(0, (await SearchAsync(database, @"assets\alpha", 20)).Items.Count,
            "ordinary search matches names rather than materialized paths");
        TestAssert.Equal(1_024L, alpha.SizeBytes, "file size fact");
        TestAssert.True(alpha.CreatedUtcTicks is > 0 && alpha.ModifiedUtcTicks is > 0,
            "creation and modified facts");
        TestAssert.Equal(0x20L, alpha.Attributes, "attribute fact");

        await database.SaveScopeAsync(new CatalogSavedScope(
            "saved-assets",
            new CatalogEntryIdentity(volumeA.VolumeId, CatalogV2Database.EncodeFileReference(10)),
            DateTime.UtcNow.Ticks));
        var saved = await database.QueryAsync(new CatalogV2Query(
            "alpha", [], CatalogQueryScope.Saved("saved-assets"), ".PNG",
            CatalogEntryType.File, 20, null));
        TestAssert.Equal(1, saved.Items.Count, "saved scope query");
    }

    private static async Task RunsProductSc1Async()
    {
        using var root = new TemporaryRoot();
        var reader = new SyntheticCatalogReader();
        await using var runtime = new ProductCoreRuntime(new CatalogV2Database(root.DatabasePath), reader);
        await runtime.InitializeAsync();
        var pipeName = "cap7ce-core-p31-" + Guid.NewGuid().ToString("N");
        var secret = RandomNumberGenerator.GetBytes(32);
        await using var server = new CorePipeServer(pipeName, runtime);
        using var serverTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var serverTask = server.RunAsync(secret, serverTimeout.Token);
        var pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
        await pipe.ConnectAsync(5_000);
        var client = new ProtocolClient(pipe);
        var hello = ProtocolClient.ReadBody<SessionHelloResponse>(await client.RequestAsync(
            "hello",
            CoreOperations.SessionHello,
            new SessionHelloRequest(
                Convert.ToBase64String(secret),
                [CoreProtocol.CurrentVersion],
                "Cap7CE.Core.P31.Tests",
                "1.0.4",
                Environment.ProcessId)));
        TestAssert.False(hello.SyntheticFixture, "SC/1 product page source marker");
        TestAssert.True(hello.Capabilities.SequenceEqual(CoreOperations.P31Capabilities),
            "SC/1 P3.1 capabilities");

        var capabilityBody = ProtocolClient.ReadBody<CapabilityStatusResponse>(await client.RequestAsync(
            "capability", CoreOperations.CapabilityStatus, new { }));
        TestAssert.Equal(2, capabilityBody.CatalogSchemaVersion, "SC/1 catalog schema");
        TestAssert.Equal(CatalogV2Contract.PathStrategy, capabilityBody.PathStrategy, "SC/1 path strategy");
        TestAssert.False(capabilityBody.ElectronConnected, "SC/1 remains outside Electron");

        var volumes = ProtocolClient.ReadBody<VolumeListResponse>(await client.RequestAsync(
            "volumes", CoreOperations.VolumeList, new { }));
        _ = await client.RequestAsync("selection", CoreOperations.VolumeSelection,
            new VolumeSelectionRequest(volumes.Volumes.Select(volume => volume.VolumeId).ToArray()));
        var build = ProtocolClient.ReadBody<CatalogBuildResponse>(await client.RequestAsync(
            "build", CoreOperations.CatalogBuild, new CatalogBuildRequest([])));
        await WaitForTaskAsync(runtime, build.TaskId, "completed");

        var resolvedScope = ProtocolClient.ReadBody<CatalogResolveScopeResponse>(await client.RequestAsync(
            "resolve-scope", CoreOperations.CatalogResolveScope,
            new CatalogResolveScopeRequest(@"A:\assets")));
        TestAssert.True(resolvedScope.Resolved && resolvedScope.Queryable,
            "SC/1 resolves a Skim path to a queryable stable scope");
        TestAssert.Equal(CatalogV2Database.EncodeFileReference(10), resolvedScope.RootFileReference!,
            "SC/1 resolved scope identity");
        var resolvedVolumeRoot = ProtocolClient.ReadBody<CatalogResolveScopeResponse>(await client.RequestAsync(
            "resolve-volume-root", CoreOperations.CatalogResolveScope,
            new CatalogResolveScopeRequest(@"A:\")));
        TestAssert.True(resolvedVolumeRoot.Resolved && resolvedVolumeRoot.Queryable,
            "SC/1 resolves a drive root to a queryable volume scope");
        TestAssert.Equal(volumes.Volumes.Single(volume => volume.DisplayName == "A:").VolumeId,
            resolvedVolumeRoot.VolumeId!, "SC/1 drive root keeps the stable volume identity");
        TestAssert.True(resolvedVolumeRoot.RootFileReference is null,
            "SC/1 drive root uses the existing volume filter without a synthetic directory identity");
        TestAssert.Equal(CatalogV2Database.EncodeFileReference(5), resolvedVolumeRoot.DirectoryFileReference!,
            "drive child browsing resolves the actual catalog root identity");
        TestAssert.Equal(resolvedScope.RootFileReference!, resolvedScope.DirectoryFileReference!,
            "folder child browsing shares its stable directory identity");
        var rootChildren = ProtocolClient.ReadBody<SearchPageResponse>(await client.RequestAsync(
            "browse-root-children", CoreOperations.SearchStart, new SearchStartRequest(
                "", 1, CoreSearchSorts.NameAscending, [resolvedVolumeRoot.VolumeId!],
                new CoreSearchScopeRequest("direct-children", resolvedVolumeRoot.VolumeId,
                    resolvedVolumeRoot.DirectoryFileReference), EntryType: "any")));
        TestAssert.Equal("assets", rootChildren.Items.Single().Name, "first root child is a folder");
        TestAssert.True(rootChildren.Items.Single().IsDirectory, "child query preserves folder type");
        var rootChildrenNext = ProtocolClient.ReadBody<SearchPageResponse>(await client.RequestAsync(
            "browse-root-children-next", CoreOperations.SearchNextPage, new SearchNextPageRequest(rootChildren.NextCursor!)));
        TestAssert.Equal("shared.txt", rootChildrenNext.Items.Single().Name, "signed child cursor excludes nested files and other volumes");
        TestAssert.True(rootChildrenNext.NextCursor is null, "root itself is excluded from child browsing");
        var folderChildren = ProtocolClient.ReadBody<SearchPageResponse>(await client.RequestAsync(
            "browse-folder-children", CoreOperations.SearchStart, new SearchStartRequest(
                "", 100, CoreSearchSorts.NameAscending, [resolvedScope.VolumeId!],
                new CoreSearchScopeRequest("direct-children", resolvedScope.VolumeId,
                    resolvedScope.DirectoryFileReference), EntryType: "any")));
        TestAssert.Equal("alpha.png", folderChildren.Items.Single().Name, "folder browsing contains direct children only");

        var first = ProtocolClient.ReadBody<SearchPageResponse>(await client.RequestAsync(
            "search-first",
            CoreOperations.SearchStart,
            new SearchStartRequest(
                "shared", 1, CoreSearchSorts.NameAscending, [],
                new CoreSearchScopeRequest("all-volumes"), null, "file")));
        TestAssert.Equal(1, first.Items.Count, "SC/1 real catalog first page");
        TestAssert.True(first.NextCursor is not null, "SC/1 real catalog cursor");
        var second = ProtocolClient.ReadBody<SearchPageResponse>(await client.RequestAsync(
            "search-next",
            CoreOperations.SearchNextPage,
            new SearchNextPageRequest(first.NextCursor!)));
        TestAssert.Equal(1, second.Items.Count, "SC/1 real catalog next page");
        TestAssert.False(first.Items[0].Id == second.Items[0].Id, "SC/1 page identities");

        reader.SlowReads = true;
        var rebuild = ProtocolClient.ReadBody<CatalogBuildResponse>(await client.RequestAsync(
            "rebuild", CoreOperations.CatalogRebuild, new CatalogBuildRequest([])));
        await Task.Delay(20);
        var cancel = ProtocolClient.ReadBody<CatalogCancelResponse>(await client.RequestAsync(
            "cancel-build", CoreOperations.CatalogCancel, new CatalogCancelRequest(rebuild.TaskId)));
        TestAssert.True(cancel.Accepted, "SC/1 catalog task cancellation accepted");
        await WaitForTaskAsync(runtime, rebuild.TaskId, "cancelled");

        var shutdown = ProtocolClient.ReadBody<CoreShutdownResponse>(await client.RequestAsync(
            "shutdown", CoreOperations.CoreShutdown, new { }));
        TestAssert.True(shutdown.Accepted, "SC/1 bounded shutdown");
        await pipe.DisposeAsync();
        await serverTask.WaitAsync(TimeSpan.FromSeconds(5));
    }

    private static async Task<CatalogV2QueryPage> SearchAsync(
        CatalogV2Database database,
        string query,
        int pageSize,
        IReadOnlyList<string>? volumeIds = null) => await database.QueryAsync(new CatalogV2Query(
            query,
            volumeIds ?? [],
            CatalogQueryScope.AllVolumes(),
            null,
            CatalogEntryType.Any,
            pageSize,
            null));

    private static async Task<CoreVolumeStatus> FindVolumeAsync(ProductCoreRuntime runtime, string displayName) =>
        (await runtime.ReadStatusAsync(CancellationToken.None)).Volumes.Single(volume => volume.DisplayName == displayName);

    private static async Task RunTaskAsync(ProductCoreRuntime runtime, CatalogBuildResponse task)
    {
        TestAssert.True(task.Accepted, "catalog task accepted");
        _ = await WaitForTaskAsync(runtime, task.TaskId, "completed");
    }

    private static async Task<CoreCatalogTaskStatus> WaitForTaskAsync(
        ProductCoreRuntime runtime,
        string taskId,
        string expected)
    {
        for (var attempt = 0; attempt < 500; attempt++)
        {
            var status = await runtime.ReadStatusAsync(CancellationToken.None);
            var task = status.Tasks.Single(item => item.TaskId == taskId);
            if (task.State != "running")
            {
                TestAssert.Equal(expected, task.State, $"catalog task {task.ErrorCode}");
                return task;
            }
            await Task.Delay(10);
        }
        throw new InvalidOperationException("catalog task timeout");
    }

    private static CatalogPathStrategyReport ComparePathStrategies()
    {
        const int directories = 1_000;
        const int filesPerDirectory = 10;
        var directoryPaths = Enumerable.Range(0, directories)
            .Select(index => $"root\\group-{index / 100:D2}\\folder-{index:D4}")
            .ToArray();
        var fileNames = Enumerable.Range(0, directories * filesPerDirectory)
            .Select(index => $"asset-{index:D6}.png")
            .ToArray();

        var watch = Stopwatch.StartNew();
        long parentLength = 0;
        for (var index = 0; index < fileNames.Length; index++)
        {
            parentLength += directoryPaths[index / filesPerDirectory].Length + 1 + fileNames[index].Length;
        }
        watch.Stop();
        var parentLookup = watch.Elapsed.TotalMilliseconds;

        watch.Restart();
        long cachedLength = 0;
        for (var index = 0; index < fileNames.Length; index++)
        {
            cachedLength += directoryPaths[index / filesPerDirectory].Length + 1 + fileNames[index].Length;
        }
        watch.Stop();
        var cachedLookup = watch.Elapsed.TotalMilliseconds;

        var directoryBytes = directoryPaths.Sum(path => Encoding.UTF8.GetByteCount(path));
        var materializedBytes = fileNames.Select((name, index) =>
            Encoding.UTF8.GetByteCount(directoryPaths[index / filesPerDirectory] + "\\" + name)).Sum();
        var measurements = new[]
        {
            new CatalogPathStrategyMeasurement("parent-chain-on-demand", 0, 0, parentLookup),
            new CatalogPathStrategyMeasurement("directory-path-cache", directoryBytes, 100, cachedLookup),
            new CatalogPathStrategyMeasurement("materialized-node-path", materializedBytes, 1_100, 0)
        };
        TestAssert.True(directoryBytes < materializedBytes, "directory path cache storage comparison");
        TestAssert.True(measurements[1].MoveInvalidations < measurements[2].MoveInvalidations,
            "directory path cache move invalidation comparison");
        TestAssert.True(parentLength == cachedLength, "path strategy lookup equivalence");
        return new CatalogPathStrategyReport(CatalogV2Contract.PathStrategy, measurements);
    }

    private sealed class TemporaryRoot : IDisposable
    {
        public TemporaryRoot()
        {
            DirectoryPath = Path.Combine(Path.GetTempPath(), "Cap7CE-Core-P31-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(DirectoryPath);
        }

        public string DirectoryPath { get; }
        public string DatabasePath => Path.Combine(DirectoryPath, "catalog.db");

        public void Dispose()
        {
            SqliteConnection.ClearAllPools();
            if (Directory.Exists(DirectoryPath)) Directory.Delete(DirectoryPath, recursive: true);
        }
    }
}
