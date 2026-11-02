using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Host.MetadataScheduling;
using Cap7CE.Core.Host.MetadataWorkers;

namespace Cap7CE.Core.Tests;

internal static class MetadataBuildSweepTests
{
    public static async Task ProbeAsync() {
        var fixture=new MetadataSweepFixture(25);var sweep=new MetadataBuildSweep(fixture,MetadataSweepFixture.Specifications);
        var watch=System.Diagnostics.Stopwatch.StartNew();sweep.Start(MetadataSweepFixture.Policy,true);var result=await sweep.WaitForIdleAsync();
        Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new{generatedTasks=result.Processed,elapsedMs=watch.Elapsed.TotalMilliseconds,sourceFilesRead=false,result.Phase}));
    }
    private static MetadataBuildSweep Create(MetadataSweepFixture fixture) => new(fixture, MetadataSweepFixture.Specifications, yieldMilliseconds: 0, waitMilliseconds: 2);
    internal static async Task UntilAsync(Func<bool> condition) {
        for (var step = 0; step < 1000; step++) { if (condition()) return; await Task.Delay(2); }
        throw new InvalidOperationException("metadata sweep test did not advance");
    }
    public static async Task RunAsync()
    {
        var light = new MetadataSweepFixture(25); var lightSweep = Create(light);
        lightSweep.Start(MetadataSweepFixture.Policy, true);
        TestAssert.Equal(100L, (await lightSweep.WaitForIdleAsync()).Processed, "lightweight readiness preserves all extraction work");
        TestAssert.Equal(4, light.StatusReads, "ledger counted only at exhaustion for each volume and kind, never per item");
        var fixture = new MetadataSweepFixture { EmptyOnce = true, SourceChangedOnce = true }; var sweep = Create(fixture);
        await TestAssert.ThrowsAsync<InvalidOperationException>(() => Task.Run(() => sweep.Start(MetadataSweepFixture.Policy, false)), "explicit confirmation required");
        TestAssert.Equal(0, fixture.Configurations, "no configure before grant");
        sweep.Start(MetadataSweepFixture.Policy, true);
        await TestAssert.ThrowsAsync<InvalidOperationException>(() => Task.Run(() => sweep.Start(MetadataSweepFixture.Policy, true)), "single sweep owner");
        var completed = await sweep.WaitForIdleAsync();
        TestAssert.Equal("completed", completed.Phase, "ordered paged sweep completes");
        TestAssert.Equal(16L, completed.Processed, "deduplicated completion count");
        TestAssert.Equal(17, fixture.Reads, "changed source retries without inflating progress");
        TestAssert.Equal(string.Join(',', MetadataSweepFixture.Volumes), string.Join(',', fixture.Order.Distinct()), "volume order preserved");
        TestAssert.Equal(1d, completed.ProgressFraction!.Value, "complete fraction");
        TestAssert.Equal("completed", (await sweep.PauseAsync()).Phase, "late pause does not alter completed sweep");
        var statusReads = fixture.StatusReads; await Task.Delay(20); TestAssert.Equal(statusReads, fixture.StatusReads, "completed controller never polls");
        sweep.Start(MetadataSweepFixture.Policy, true); await sweep.WaitForIdleAsync(); TestAssert.Equal(17, fixture.Reads, "existing facts skip content readers");
        fixture = new() { Offline = true }; sweep = Create(fixture); sweep.Start(MetadataSweepFixture.Policy, true);
        await UntilAsync(() => sweep.Snapshot.Phase == "waiting"); TestAssert.Equal(0, fixture.Reads, "offline never reads source");
        fixture.Offline = false; TestAssert.Equal("completed", (await sweep.WaitForIdleAsync()).Phase, "available volume resumes same sweep");
        fixture = new() { BlockRead = true }; sweep = Create(fixture); sweep.Start(MetadataSweepFixture.Policy, true);
        await UntilAsync(() => fixture.Reads == 1); await Task.WhenAll(sweep.PauseAsync(), sweep.PauseAsync());
        TestAssert.Equal("paused", sweep.Snapshot.Phase, "active cancellation joins execution"); TestAssert.Equal(0, fixture.Finished, "cancelled output cannot publish");
        fixture.BlockRead = false; sweep.Start(MetadataSweepFixture.Policy, true);
        TestAssert.Equal(16L, (await sweep.WaitForIdleAsync()).Processed, "resume retains counters and rediscovery reuses valid facts");
        fixture = new() { BlockRead = true, PauseFault = true, ExitDelay = 40 }; sweep = Create(fixture); sweep.Start(MetadataSweepFixture.Policy, true);
        await UntilAsync(() => fixture.Reads == 1); await sweep.PauseAsync();
        TestAssert.Equal(0, fixture.Live, "control failure still joins decoder cleanup before returning");
        TestAssert.Equal("metadata-control-failed", sweep.Snapshot.ErrorCode, "failed pause remains explicit");
        fixture = new() { BlockAfter = 3, ResultState = "failed" }; sweep = Create(fixture); sweep.Start(MetadataSweepFixture.Policy, true);
        await UntilAsync(() => fixture.Reads == 3); await sweep.PauseAsync();
        TestAssert.Equal(2L, sweep.Snapshot.Processed, "partial pause retains published progress"); TestAssert.Equal(2L, sweep.Snapshot.Failed, "partial failure observations retained");
        fixture.BlockAfter = int.MaxValue; sweep.Start(MetadataSweepFixture.Policy, true); completed = await sweep.WaitForIdleAsync();
        TestAssert.Equal(16L, completed.Processed, "partial resume total counts prior and remaining facts once"); TestAssert.Equal(16L, completed.Failed, "failure observations remain distinct from environment failure");
        fixture = new(1) { ResultState = "unsupported" }; sweep = new(fixture, MetadataSweepFixture.Specifications,
            _ => throw new InvalidOperationException("retired observer"), yieldMilliseconds: 0, waitMilliseconds: 2);
        sweep.Start(MetadataSweepFixture.Policy, true); completed = await sweep.WaitForIdleAsync();
        TestAssert.Equal("completed", completed.Phase, "observer failure cannot stop owner"); TestAssert.Equal(4L, completed.Unsupported, "unsupported observations counted");
        fixture = new() { BlockConfiguration = true }; sweep = Create(fixture); sweep.Start(MetadataSweepFixture.Policy, true);
        await UntilAsync(() => fixture.Configurations == 1); await sweep.PauseAsync(); TestAssert.Equal(0, fixture.Discoveries, "pause while configuring does not discover");
        fixture = new() { Fault = true }; sweep = Create(fixture); sweep.Start(MetadataSweepFixture.Policy, true);
        TestAssert.Equal("failed", (await sweep.WaitForIdleAsync()).Phase, "environment failure stops sweep"); TestAssert.True(fixture.Pauses > 0, "failure revokes session");
        fixture.Fault = false; sweep.Start(MetadataSweepFixture.Policy, true); TestAssert.Equal("completed", (await sweep.WaitForIdleAsync()).Phase, "explicit retry recovers");
        fixture = new() { MoreChanges = 70 }; sweep = Create(fixture); sweep.Start(MetadataSweepFixture.Policy, true, changesOnly: true);
        await sweep.WaitForIdleAsync(); TestAssert.Equal(64, fixture.Changes, "bounded changes yield to extraction"); TestAssert.True(sweep.HasPendingChanges, "remaining hints request another wake");
        TestAssert.Equal(0, fixture.Discoveries, "maintenance does not run full discovery");
        sweep.Start(MetadataSweepFixture.Policy, true, changesOnly: true); await sweep.WaitForIdleAsync(); TestAssert.False(sweep.HasPendingChanges, "quiet change batch stays dormant");
        var estimate = new MetadataBuildEstimate(); var counts = new Dictionary<FileFactKind, long> { [FileFactKind.ImageDimensions] = 10, [FileFactKind.Video] = 10 };
        for (var index = 0; index < 8; index++) estimate.Add(FileFactKind.ImageDimensions, 100);
        TestAssert.True(estimate.Remaining(counts) is null, "unsampled kind has unknown ETA");
        estimate.Add(FileFactKind.Video, 200); estimate.Add(FileFactKind.Video, 200); TestAssert.Equal(3d, estimate.Remaining(counts)!.Value, "original sample mean ETA");
        estimate.Add(FileFactKind.ImageDimensions, 100000); for (var index = 0; index < 64; index++) estimate.Add(FileFactKind.ImageDimensions, 100);
        TestAssert.Equal(3d, estimate.Remaining(counts)!.Value, "old samples retire at the 64-sample budget");
        await RealExecutionAsync();
        Console.WriteLine("Core build sweep: ordered pages, leases, stale source retry, offline wait, cancellation/restore, failure recovery, bounded change batches and real Node facts passed.");
    }
    private static async Task RealExecutionAsync()
    {
        if (!OperatingSystem.IsWindows()) return;
        var specifications = await MetadataExtractorManifest.LoadAsync(FileFactExecutionTests.Resources.Root);
        var reader = new CountingReader(new NodeMetadataWorker(FileFactExecutionTests.Resources));
        await using var fixture = await FileFactExecutionTests.Fixture.CreateAsync(reader);
        var original = await File.ReadAllBytesAsync(fixture.Source);
        var sweep = new MetadataBuildSweep(await fixture.Session.AttachBuildOwnerAsync(), specifications, yieldMilliseconds: 0, waitMilliseconds: 2);
        var policy = new FileFactQueuePolicy([fixture.Identity.VolumeId], [new(fixture.Identity.VolumeId)], []);
        TestAssert.Equal(0, reader.Reads, "assembly never starts content reading");
        sweep.Start(policy, true); TestAssert.Equal("completed", (await sweep.WaitForIdleAsync()).Phase, "actual C# sweep and independent Node complete");
        TestAssert.Equal(1, reader.Reads, "only generated matching text source is read");
        var version = specifications.Single(item => item.Kind == FileFactKind.TextData).ExtractorVersion;
        var fact = await new FileFactDatabase(fixture.Database).ReadCurrentAsync(fixture.Identity, FileFactKind.TextData, version);
        TestAssert.Equal(6L, fact!.TextDataProperties!.CharacterCount!.Value, "manifest version publishes actual parsed facts");
        sweep.Start(policy, true); await sweep.WaitForIdleAsync(); TestAssert.Equal(1, reader.Reads, "real repeated sweep reuses facts");
        TestAssert.True(original.SequenceEqual(await File.ReadAllBytesAsync(fixture.Source)), "source bytes unchanged");
    }
    private sealed class CountingReader(IFileFactContentReader inner) : IFileFactContentReader
    {
        internal int Reads;
        public Task<FileFactExtractionResult> ReadAsync(FileFactExtractionTicket ticket, CancellationToken token) { Reads++; return inner.ReadAsync(ticket, token); }
        public Task ReleaseAsync() => inner.ReleaseAsync();
        public ValueTask DisposeAsync() => inner.DisposeAsync();
    }
}
