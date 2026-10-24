using Cap7CE.Core.Catalog;
using Cap7CE.Core.Host;

namespace Cap7CE.Core.Tests;

internal static class CatalogPreparationProgressTests
{
    public static async Task RunAsync()
    {
        var clock = new Clock(); var progress = new CatalogPreparationProgressOwner(clock);
        progress.Report("volume", "A:", "scanning", 10);
        TestAssert.True(progress.Read()!.Fraction is null && progress.Read()!.RemainingSeconds is null, "unknown total has no invented percentage or ETA");
        clock.Advance(10); progress.Report("volume", "A:", "scanning", 25, 100);
        TestAssert.Equal(0.25, progress.Read()!.Fraction!.Value, "known total fraction");
        TestAssert.Equal(30d, progress.Read()!.RemainingSeconds!.Value, "stage-local ETA");
        progress.Report("volume", "A:", "publishing", 100);
        TestAssert.True(progress.Read()!.Fraction is null && progress.Read()!.RemainingSeconds is null, "publication resets total and ETA");
        progress.Clear(); TestAssert.True(progress.Read() is null, "terminal progress clears");

        using var fixture = new TemporaryCatalogFixture(); var catalog = new CatalogV2Database(fixture.DatabasePath);
        await catalog.InitializeAsync(); var reader = new SyntheticCatalogReader { SlowReads = true };
        var sync = new CatalogSynchronizationService(catalog, reader, progress: progress);
        var volume = (await sync.DiscoverAsync()).First(); await catalog.SetVolumeSelectionAsync([volume.VolumeId]);
        var work = sync.SynchronizeAsync([], false);
        for (var i = 0; i < 200 && progress.Read()?.Stage != "scanning" && !work.IsCompleted; i++) await Task.Delay(1);
        TestAssert.Equal("scanning", progress.Read()!.Stage, "live snapshot stage is readable before publication");
        TestAssert.Equal(CatalogV2VolumeState.Building, (await catalog.ReadVolumesAsync()).Single(item => item.VolumeId == volume.VolumeId).State, "progress does not expose incomplete snapshot queries");
        await work; TestAssert.True(progress.Read() is null, "successful build clears progress");
        reader.FailNextSnapshotRead = true;
        await TestAssert.ThrowsAsync<IOException>(() => sync.SynchronizeAsync([], true), "failure remains visible");
        TestAssert.True(progress.Read() is null, "failed build clears progress");
        TestAssert.Equal(CatalogV2VolumeState.NeedsRebuild,(await catalog.ReadVolumeAsync(volume.VolumeId))!.State,"failed Reader snapshot retires building state");
        using var cancelled=new CancellationTokenSource();
        var interrupted=sync.SynchronizeAsync([],false,cancelled.Token);
        for(var i=0;i<200&&progress.Read()?.Stage!="scanning"&&!interrupted.IsCompleted;i++)await Task.Delay(1);
        cancelled.Cancel();await TestAssert.ThrowsAsync<OperationCanceledException>(()=>interrupted,"snapshot cancellation remains observable");
        TestAssert.Equal(CatalogV2VolumeState.NeedsRebuild,(await catalog.ReadVolumeAsync(volume.VolumeId))!.State,"cancelled snapshot retires building state");
        reader.FailNextSnapshotRead=true;reader.FailSnapshotClose=true;
        await TestAssert.ThrowsAsync<IOException>(()=>sync.SynchronizeAsync([],false),"Reader close failure remains observable");
        TestAssert.Equal(CatalogV2VolumeState.NeedsRebuild,(await catalog.ReadVolumeAsync(volume.VolumeId))!.State,"Reader close failure cannot bypass local build disposal");
    }

    private sealed class Clock : TimeProvider
    {
        private long stamp;
        public override long TimestampFrequency => TimeSpan.TicksPerSecond;
        public override long GetTimestamp() => stamp;
        public void Advance(int seconds) => stamp += seconds * TimeSpan.TicksPerSecond;
    }
}
