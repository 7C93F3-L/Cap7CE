using Cap7CE.Core.Catalog;

namespace Cap7CE.Core.Tests;

internal static class CatalogRecoveryTests
{
    private const string VolumeId = "fixture-recovery-volume";
    private const string JournalId = "fixture-journal-recovery-1";
    private const int BatchSize = 2_000;

    public static async Task RunAsync()
    {
        await RecoversAndResumesAfterProcessTerminationAsync();
        await HandlesOfflineAndJournalDiscontinuityAsync();
    }

    private static async Task RecoversAndResumesAfterProcessTerminationAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        await fixture.Database.InitializeAsync();
        await fixture.Database.RegisterVolumeAsync(VolumeId, "NTFS", JournalId);
        await fixture.Database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.Disabled, CatalogVolumeState.Discovering);
        var building = await fixture.Database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.Discovering, CatalogVolumeState.Building);
        await fixture.Database.StartTaskAsync(new CatalogTaskRecord(
            "fixture-initial-build", VolumeId, "initial-build", "writing", 0,
            BatchSize * 3, 100, null, null));

        var first = await fixture.Database.ApplyBatchAsync(Batch(
            building.CatalogRevision, null, BatchSize, 1));
        await fixture.Database.UpdateTaskProgressAsync(
            "fixture-initial-build", "writing", BatchSize, BatchSize * 3);
        var second = await fixture.Database.ApplyBatchAsync(Batch(
            first.CatalogRevision, Checkpoint(BatchSize), BatchSize * 2, BatchSize + 1));
        await fixture.Database.UpdateTaskProgressAsync(
            "fixture-initial-build", "writing", BatchSize * 2, BatchSize * 3);

        await CatalogCrashWorker.OpenTransactionAndCrashAsync(new CatalogCrashWorkerInput(
            fixture.DatabasePath,
            VolumeId,
            JournalId,
            Checkpoint(BatchSize * 2),
            second.CatalogRevision,
            Checkpoint(BatchSize * 3),
            "fixture-uncommitted-snapshot",
            BatchSize * 2 + 1,
            BatchSize));

        var reopened = new CatalogDatabase(fixture.DatabasePath);
        await reopened.InitializeAsync();
        var recoveredState = await reopened.ReadStateAsync();
        var recoveredVolume = await reopened.ReadVolumeAsync(VolumeId)
            ?? throw new InvalidOperationException("Recovery fixture volume is missing.");
        var recoveredTask = await reopened.ReadTaskAsync("fixture-initial-build")
            ?? throw new InvalidOperationException("Recovery fixture task is missing.");
        TestAssert.Equal(second.CatalogRevision, recoveredState.CatalogRevision,
            "crash recovery catalog revision");
        TestAssert.Equal("fixture-snapshot-4000", recoveredState.CommittedSnapshotId,
            "crash recovery snapshot");
        TestAssert.Equal(Checkpoint(BatchSize * 2), recoveredVolume.Checkpoint,
            "crash recovery checkpoint");
        TestAssert.Equal(CatalogVolumeState.Building, recoveredVolume.State,
            "crash recovery volume state");
        TestAssert.Equal((long)(BatchSize * 2), await reopened.CountNodesAsync(VolumeId),
            "crash recovery node count");
        TestAssert.Equal((long)(BatchSize * 2), recoveredTask.Processed,
            "crash recovery task progress");
        TestAssert.True(await reopened.CheckIntegrityAsync(), "crash recovery integrity");

        var resumed = await reopened.ApplyBatchAsync(Batch(
            recoveredState.CatalogRevision,
            recoveredVolume.Checkpoint,
            BatchSize * 3,
            BatchSize * 2 + 1));
        await reopened.UpdateTaskProgressAsync(
            "fixture-initial-build", "finishing", BatchSize * 3, BatchSize * 3);
        await reopened.CompleteTaskAsync("fixture-initial-build", 200, null);
        await reopened.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.Building, CatalogVolumeState.Ready);
        TestAssert.Equal((long)(BatchSize * 3), await reopened.CountNodesAsync(VolumeId),
            "resumed build node count");
        TestAssert.Equal("fixture-snapshot-6000", resumed.CommittedSnapshotId,
            "resumed build snapshot");
        TestAssert.True((await reopened.ReadStateAsync()).Queryable, "resumed build queryability");
    }

    private static async Task HandlesOfflineAndJournalDiscontinuityAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        await fixture.Database.InitializeAsync();
        await fixture.Database.RegisterVolumeAsync(VolumeId, "NTFS", JournalId);
        await fixture.Database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.Disabled, CatalogVolumeState.Discovering);
        var building = await fixture.Database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.Discovering, CatalogVolumeState.Building);
        var committed = await fixture.Database.ApplyBatchAsync(new CatalogWriteBatch(
            VolumeId,
            JournalId,
            null,
            building.CatalogRevision,
            "fixture-checkpoint-ready",
            "fixture-snapshot-ready",
            [Node(1), Node(2)]));
        await fixture.Database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.Building, CatalogVolumeState.Ready);

        var offline = await fixture.Database.ReconcileVolumeAsync(new CatalogVolumeObservation(
            VolumeId, IsOnline: false, JournalId: null, StoredCheckpointContinuous: false));
        TestAssert.Equal(CatalogVolumeState.Offline, offline.State, "offline observation state");
        TestAssert.False((await fixture.Database.ReadStateAsync()).Queryable, "offline queryability");
        await TestAssert.ThrowsAsync<CatalogNotQueryableException>(
            () => fixture.Database.ReadNodesPageAsync(VolumeId, null, 10),
            "offline volume must not be queried");

        var catchingUp = await fixture.Database.ReconcileVolumeAsync(new CatalogVolumeObservation(
            VolumeId, IsOnline: true, JournalId, StoredCheckpointContinuous: true));
        TestAssert.Equal(CatalogVolumeState.CatchingUp, catchingUp.State,
            "continuous online observation state");
        TestAssert.Equal(2, (await fixture.Database.ReadNodesPageAsync(VolumeId, null, 10)).Count,
            "catching-up last complete catalog");
        await fixture.Database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.CatchingUp, CatalogVolumeState.Ready);

        var gap = await fixture.Database.ReconcileVolumeAsync(new CatalogVolumeObservation(
            VolumeId, IsOnline: true, JournalId, StoredCheckpointContinuous: false));
        TestAssert.Equal(CatalogVolumeState.NeedsRebuild, gap.State, "journal gap state");
        TestAssert.True((await fixture.Database.ReadStateAsync()).NeedsRebuild, "journal gap rebuild flag");
        TestAssert.Equal(2L, await fixture.Database.CountNodesAsync(VolumeId),
            "journal gap preserves old nodes until rebuild starts");

        var rebuild = await fixture.Database.BeginRebuildAsync(
            VolumeId, "fixture-journal-recovery-2", "fixture-rebuild-empty");
        TestAssert.Equal(CatalogVolumeState.Building, rebuild.State, "rebuild state");
        TestAssert.Equal(null, rebuild.Checkpoint, "rebuild checkpoint reset");
        TestAssert.Equal(0L, await fixture.Database.CountNodesAsync(VolumeId), "rebuild clears stale nodes");
        TestAssert.False((await fixture.Database.ReadStateAsync()).NeedsRebuild, "rebuild flag cleared");

        var rebuilt = await fixture.Database.ApplyBatchAsync(new CatalogWriteBatch(
            VolumeId,
            "fixture-journal-recovery-2",
            null,
            rebuild.CatalogRevision,
            "fixture-checkpoint-rebuilt",
            "fixture-snapshot-rebuilt",
            [Node(3)]));
        await fixture.Database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.Building, CatalogVolumeState.Ready);
        TestAssert.Equal(1L, await fixture.Database.CountNodesAsync(VolumeId), "rebuilt node count");
        TestAssert.True(rebuilt.CatalogRevision > committed.CatalogRevision, "rebuild revision advance");

        await fixture.Database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.Ready, CatalogVolumeState.Degraded);
        TestAssert.False((await fixture.Database.ReadStateAsync()).Queryable, "degraded queryability");
        await TestAssert.ThrowsAsync<CatalogNotQueryableException>(
            () => fixture.Database.ReadNodesPageAsync(VolumeId, null, 10),
            "degraded volume must not be queried");
        var recoveredDegraded = await fixture.Database.ReconcileVolumeAsync(new CatalogVolumeObservation(
            VolumeId,
            IsOnline: true,
            JournalId: "fixture-journal-recovery-2",
            StoredCheckpointContinuous: true));
        TestAssert.Equal(CatalogVolumeState.CatchingUp, recoveredDegraded.State,
            "degraded continuous recovery state");
        await fixture.Database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.CatchingUp, CatalogVolumeState.Ready);

        var replacedJournal = await fixture.Database.ReconcileVolumeAsync(new CatalogVolumeObservation(
            VolumeId,
            IsOnline: true,
            JournalId: "fixture-journal-replacement",
            StoredCheckpointContinuous: true));
        TestAssert.Equal(CatalogVolumeState.NeedsRebuild, replacedJournal.State,
            "journal identity replacement state");
    }

    private static CatalogWriteBatch Batch(
        long revision,
        string? expectedCheckpoint,
        int nextCount,
        long startReference) =>
        new(
            VolumeId,
            JournalId,
            expectedCheckpoint,
            revision,
            Checkpoint(nextCount),
            $"fixture-snapshot-{nextCount}",
            Enumerable.Range(0, BatchSize)
                .Select(index => Node(startReference + index))
                .ToArray());

    private static CatalogNodeRecord Node(long fileReference) =>
        new(
            VolumeId,
            fileReference,
            null,
            $"fixture-node-{fileReference:D6}.bin",
            ".bin",
            false,
            0,
            true,
            128,
            638_900_000_000_000_000);

    private static string Checkpoint(int count) => $"fixture-checkpoint-{count}";
}
