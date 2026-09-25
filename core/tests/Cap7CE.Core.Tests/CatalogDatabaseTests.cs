using Cap7CE.Core.Catalog;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class CatalogDatabaseTests
{
    private const string VolumeId = "fixture-volume-a";

    public static async Task RunAsync()
    {
        await PersistsVersionedCatalogAsync();
        await CommitsRecordsAndCheckpointAtomicallyAsync();
        await RejectsUnsupportedSchemaAsync();
    }

    private static async Task PersistsVersionedCatalogAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        await fixture.Database.InitializeAsync();
        var initial = await fixture.Database.ReadStateAsync();
        TestAssert.Equal(1, initial.SchemaVersion, "catalog schema version");
        TestAssert.Equal(0L, initial.CatalogRevision, "initial catalog revision");
        TestAssert.False(initial.Queryable, "empty catalog queryability");
        TestAssert.True(await fixture.Database.CheckIntegrityAsync(), "new catalog integrity");

        var registered = await fixture.Database.RegisterVolumeAsync(VolumeId, "NTFS", "journal-fixture-1");
        TestAssert.Equal(CatalogVolumeState.Disabled, registered.State, "registered volume state");
        await fixture.Database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.Disabled, CatalogVolumeState.Discovering);
        var building = await fixture.Database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.Discovering, CatalogVolumeState.Building);
        TestAssert.Equal(CatalogVolumeState.Building, building.State, "building volume state");

        var reopened = new CatalogDatabase(fixture.DatabasePath);
        await reopened.InitializeAsync();
        var persisted = await reopened.ReadVolumeAsync(VolumeId);
        TestAssert.Equal(CatalogVolumeState.Building, persisted?.State, "reopened volume state");
        TestAssert.Equal(building.CatalogRevision, persisted?.CatalogRevision, "reopened volume revision");

        await TestAssert.ThrowsAsync<CatalogStateTransitionException>(
            () => reopened.TransitionVolumeAsync(
                VolumeId, CatalogVolumeState.Building, CatalogVolumeState.Offline),
            "invalid volume transition");
        TestAssert.Equal(
            building.CatalogRevision,
            (await reopened.ReadStateAsync()).CatalogRevision,
            "invalid transition must not advance revision");
    }

    private static async Task CommitsRecordsAndCheckpointAtomicallyAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        await fixture.Database.InitializeAsync();
        await fixture.Database.RegisterVolumeAsync(VolumeId, "NTFS", "journal-fixture-2");
        await fixture.Database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.Disabled, CatalogVolumeState.Discovering);
        var building = await fixture.Database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.Discovering, CatalogVolumeState.Building);

        var firstBatch = Batch(
            building.CatalogRevision,
            expectedCheckpoint: null,
            nextCheckpoint: "checkpoint-10",
            snapshotId: "snapshot-1",
            Nodes(
                Node(10, null, "fixture-root", string.Empty, isDirectory: true),
                Node(11, 10, "sample-one.png", ".png")));
        var afterFirst = await fixture.Database.ApplyBatchAsync(firstBatch);
        TestAssert.Equal("snapshot-1", afterFirst.CommittedSnapshotId, "committed snapshot");
        TestAssert.Equal(2L, await fixture.Database.CountNodesAsync(VolumeId), "committed node count");
        var checkpoint = await fixture.Database.ReadVolumeAsync(VolumeId);
        TestAssert.Equal("checkpoint-10", checkpoint?.Checkpoint, "committed checkpoint");

        var failingBatch = Batch(
            afterFirst.CatalogRevision,
            "checkpoint-10",
            "checkpoint-20",
            "snapshot-2",
            Nodes(
                Node(12, 10, "sample-two.jpg", ".jpg"),
                Node(13, 10, string.Empty, ".jpg")));
        await TestAssert.ThrowsAsync<SqliteException>(
            () => fixture.Database.ApplyBatchAsync(failingBatch),
            "constraint failure must abort a catalog batch");
        var afterFailure = await fixture.Database.ReadStateAsync();
        var volumeAfterFailure = await fixture.Database.ReadVolumeAsync(VolumeId);
        TestAssert.Equal(afterFirst.CatalogRevision, afterFailure.CatalogRevision, "rollback revision");
        TestAssert.Equal("snapshot-1", afterFailure.CommittedSnapshotId, "rollback snapshot");
        TestAssert.Equal("checkpoint-10", volumeAfterFailure?.Checkpoint, "rollback checkpoint");
        TestAssert.Equal(2L, await fixture.Database.CountNodesAsync(VolumeId), "rollback nodes");

        var validBatch = Batch(
            afterFailure.CatalogRevision,
            "checkpoint-10",
            "checkpoint-20",
            "snapshot-2",
            Nodes(Node(12, 10, "sample-two.jpg", ".jpg")));
        var afterSecond = await fixture.Database.ApplyBatchAsync(validBatch);
        await TestAssert.ThrowsAsync<CatalogConcurrencyException>(
            () => fixture.Database.ApplyBatchAsync(validBatch),
            "stale batch must be rejected");

        await fixture.Database.StartTaskAsync(new CatalogTaskRecord(
            "task-fixture-1", VolumeId, "initial-build", "writing", 2, 3, 100, null, null));
        await fixture.Database.UpdateTaskProgressAsync("task-fixture-1", "finishing", 3, 3);
        await fixture.Database.CompleteTaskAsync("task-fixture-1", 200, null);
        var task = await fixture.Database.ReadTaskAsync("task-fixture-1");
        TestAssert.Equal(3L, task?.Processed, "persisted task progress");
        TestAssert.Equal(200L, task?.CompletedUtcTicks, "persisted task completion");
        TestAssert.Equal(afterSecond.CatalogRevision, (await fixture.Database.ReadStateAsync()).CatalogRevision,
            "task progress must not mutate catalog revision");

        await TestAssert.ThrowsAsync<CatalogNotQueryableException>(
            () => fixture.Database.ReadNodesPageAsync(VolumeId, null, 2),
            "building catalog must not be queryable");
        await fixture.Database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.Building, CatalogVolumeState.Ready);
        var readyState = await fixture.Database.ReadStateAsync();
        TestAssert.True(readyState.Queryable, "ready catalog queryability");
        var firstPage = await fixture.Database.ReadNodesPageAsync(VolumeId, null, 2);
        var secondPage = await fixture.Database.ReadNodesPageAsync(VolumeId, firstPage[^1].FileReference, 2);
        TestAssert.Equal(2, firstPage.Count, "bounded first page");
        TestAssert.Equal(1, secondPage.Count, "bounded second page");
        TestAssert.Equal(12L, secondPage[0].FileReference, "keyset page position");
        TestAssert.Equal(2, (await fixture.Database.SearchNodesByNameAsync(VolumeId, "sample-", 10)).Count,
            "bounded literal name search");
        TestAssert.Equal(0, (await fixture.Database.SearchNodesByNameAsync(VolumeId, "sample_%", 10)).Count,
            "name search wildcard escaping");
        TestAssert.Equal(1, (await fixture.Database.SearchNodesByExtensionAsync(VolumeId, ".JPG", 10)).Count,
            "case-insensitive extension search");
        TestAssert.True(await fixture.Database.ReadStorageBytesAsync() > 0, "catalog logical storage size");
        await TestAssert.ThrowsAsync<ArgumentOutOfRangeException>(
            () => fixture.Database.ReadNodesPageAsync(VolumeId, null, CatalogDatabase.MaximumReadPage + 1),
            "catalog page maximum");

        await fixture.Database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.Ready, CatalogVolumeState.Offline);
        TestAssert.False((await fixture.Database.ReadStateAsync()).Queryable, "offline catalog queryability");
        await fixture.Database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.Offline, CatalogVolumeState.NeedsRebuild);
        TestAssert.True((await fixture.Database.ReadStateAsync()).NeedsRebuild, "rebuild flag");
        await fixture.Database.TransitionVolumeAsync(
            VolumeId, CatalogVolumeState.NeedsRebuild, CatalogVolumeState.Building);
        TestAssert.False((await fixture.Database.ReadStateAsync()).NeedsRebuild, "cleared rebuild flag");
        TestAssert.True(await fixture.Database.CheckIntegrityAsync(), "mutated catalog integrity");
    }

    private static async Task RejectsUnsupportedSchemaAsync()
    {
        using var fixture = new TemporaryCatalogFixture();
        var builder = new SqliteConnectionStringBuilder { DataSource = fixture.DatabasePath };
        await using (var connection = new SqliteConnection(builder.ToString()))
        {
            await connection.OpenAsync();
            using var command = connection.CreateCommand();
            command.CommandText = "CREATE TABLE foreign_data(value TEXT);";
            await command.ExecuteNonQueryAsync();
        }
        await TestAssert.ThrowsAsync<CatalogSchemaException>(
            () => fixture.Database.InitializeAsync(),
            "unversioned foreign database must not be adopted");
        await TestAssert.ThrowsAsync<CatalogSchemaException>(
            () => fixture.Database.ValidateReadOnlyAsync(),
            "unversioned foreign database must not be accepted read-only");
    }

    private static CatalogWriteBatch Batch(
        long revision,
        string? expectedCheckpoint,
        string nextCheckpoint,
        string snapshotId,
        IReadOnlyList<CatalogNodeRecord> nodes) =>
        new(VolumeId, "journal-fixture-2", expectedCheckpoint, revision, nextCheckpoint, snapshotId, nodes);

    private static CatalogNodeRecord Node(
        long fileReference,
        long? parentReference,
        string name,
        string extension,
        bool isDirectory = false) =>
        new(VolumeId, fileReference, parentReference, name, extension, isDirectory, 0, true,
            isDirectory ? null : 128, 638_900_000_000_000_000);

    private static IReadOnlyList<CatalogNodeRecord> Nodes(params CatalogNodeRecord[] nodes) => nodes;
}
