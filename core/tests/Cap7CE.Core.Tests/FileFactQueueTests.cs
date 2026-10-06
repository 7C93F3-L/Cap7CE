using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactQueueTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-fact-queue-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "fixture.db");
        try
        {
            await new CatalogV2Database(path).InitializeAsync();
            var clock = new ManualClock();
            var queue = new FileFactQueue(path, clock);
            await queue.InitializeAsync();
            await ExecuteAsync(path, """
                INSERT INTO catalog_volumes_v2 VALUES('a','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                INSERT INTO catalog_volumes_v2 VALUES('b','Y:','NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000001',NULL,'root','',1,16,1,0,1,1);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000002','0000000000000001','nested','',1,16,1,0,1,1);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000011','0000000000000002','first.png','.png',0,32,1,100,1,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('a','0000000000000012','0000000000000001','second.png','.png',0,32,1,100,1,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('b','0000000000000011',NULL,'third.png','.png',0,32,1,100,1,133000000000000003);
                """);
            var first = Job("a", "0000000000000011");
            var second = Job("a", "0000000000000012");
            var third = Job("b", "0000000000000011");
            await queue.EnqueueAsync([first, first, second, third]);
            TestAssert.True(await queue.ClaimAsync() is null, "default policy performs no extraction");
            var all = new FileFactQueuePolicy(["b", "a"], [new("a"), new("b")], []);
            await queue.SetPolicyAsync(all);
            var lease = (await queue.ClaimAsync())!;
            TestAssert.Equal(third, lease.Job, "explicit volume order wins enqueue order");
            var restricted = new FileFactQueuePolicy(["a", "b"],
                [new("a", "0000000000000001")], [new("a", "0000000000000002")]);
            await queue.SetPolicyAsync(restricted);
            TestAssert.Equal(FileFactCompletion.LeaseLost, await queue.CompleteAsync(lease.LeaseId, Observation(lease)), "changed policy rejects old in-flight result");
            TestAssert.False(await queue.RenewAsync(lease.LeaseId), "changed policy rejects old lease renewal");
            lease = (await queue.ClaimAsync(1_000))!;
            TestAssert.Equal(second, lease.Job, "exclusion overrides included ancestor");
            await queue.SetPolicyAsync(restricted);
            TestAssert.True(await queue.RenewAsync(lease.LeaseId, 1_000), "unchanged policy preserves live leases");
            TestAssert.True(await queue.ClaimAsync() is null, "excluded volume and nested folder not dispatched");
            clock.Advance(500);
            TestAssert.True(await queue.RenewAsync(lease.LeaseId, 1_000), "live lease renews");
            clock.Advance(600);
            TestAssert.True(await new FileFactQueue(path, clock).ClaimAsync() is null, "renewed lease not recovered early after restart");
            clock.Advance(500);
            var recovered = (await new FileFactQueue(path, clock).ClaimAsync())!;
            TestAssert.Equal(second, recovered.Job, "expired lease recovers after restart");
            TestAssert.False(recovered.LeaseId == lease.LeaseId, "recovered lease gets fresh token");
            TestAssert.Equal(FileFactCompletion.LeaseLost, await queue.CompleteAsync(lease.LeaseId, Observation(lease)), "crashed worker cannot publish after recovery");
            await ExecuteAsync(path, """
                CREATE TRIGGER reject_job_finish BEFORE UPDATE ON file_fact_jobs WHEN NEW.state = 'done'
                BEGIN SELECT RAISE(ABORT, 'fixture-interrupted-finish'); END;
                """);
            await TestAssert.ThrowsAsync<SqliteException>(() => queue.CompleteAsync(recovered.LeaseId, Observation(recovered)), "interrupted completion rolls back");
            TestAssert.True(await new FileFactDatabase(path).ReadCurrentAsync(second.Identity, second.Kind, 1) is null, "fact not committed separately from job");
            await ExecuteAsync(path, "DROP TRIGGER reject_job_finish;");
            TestAssert.Equal(FileFactCompletion.Published, await queue.CompleteAsync(recovered.LeaseId, Observation(recovered)), "fact and job completion publish atomically");
            await queue.EnqueueAsync([second]);
            TestAssert.True(await queue.ClaimAsync() is null, "completed source reused on enqueue");
            await queue.SetPolicyAsync(all);
            var competing = await Task.WhenAll(queue.ClaimAsync(), new FileFactQueue(path, clock).ClaimAsync());
            TestAssert.Equal(2, competing.Count(item => item is not null), "two distinct tasks claimed");
            TestAssert.Equal(2, competing.Select(item => item!.Job).Distinct().Count(), "multiple dispatchers never share a lease");
            foreach (var item in competing)
                TestAssert.Equal(FileFactCompletion.Published, await queue.CompleteAsync(item!.LeaseId, Observation(item)), "remaining source published");
            TestAssert.True(await queue.ClaimAsync() is null, "all tasks done without duplicated hardlink work");
            var facts = new FileFactDatabase(path);
            await facts.InvalidateContentAsync(first.Identity);
            await queue.EnqueueAsync([first]);
            lease = (await queue.ClaimAsync())!;
            await facts.InvalidateContentAsync(first.Identity);
            TestAssert.Equal(FileFactCompletion.SourceChanged, await queue.CompleteAsync(lease.LeaseId, Observation(lease)), "content change rejects result and requeues");
            lease = (await queue.ClaimAsync())!;
            TestAssert.Equal(2L, lease.Source.ContentRevision, "retry captures new content generation");
            await queue.CompleteAsync(lease.LeaseId, Observation(lease) with { State = FileFactState.Failed, Width = null, Height = null, ErrorCode = "decode-failed" });
            await queue.EnqueueAsync([first]);
            TestAssert.True(await queue.ClaimAsync() is null, "failed source cached instead of endless retry");

            await facts.InvalidateContentAsync(first.Identity);
            await queue.EnqueueAsync([first]);
            await queue.SetPolicyAsync(new(["a"], [new("a", "0000000000000002")], []));
            lease = (await queue.ClaimAsync())!;
            await ExecuteAsync(path, "UPDATE catalog_nodes_v2 SET parent_file_reference = '0000000000000001' WHERE file_reference = '0000000000000011' AND volume_id = 'a';");
            TestAssert.Equal(FileFactCompletion.LeaseLost, await queue.CompleteAsync(lease.LeaseId, Observation(lease)), "moving outside scope rejects in-flight result without policy change");
            await queue.SetPolicyAsync(new(["a"], [], []));
            TestAssert.True(await queue.ClaimAsync() is null, "empty includes pauses all extraction");
            TestAssert.True(await facts.ReadCurrentAsync(second.Identity, second.Kind, 1) is not null, "policy restriction retains indexed facts");
            await TestAssert.ThrowsAsync<ArgumentException>(() => queue.SetPolicyAsync(new(["a"], [new("b")], [])), "unordered scope volume rejected");
            await TestAssert.ThrowsAsync<ArgumentOutOfRangeException>(() => queue.ClaimAsync(0), "unbounded/zero lease rejected");
            await ExecuteAsync(path, """
                INSERT INTO catalog_nodes_v2 VALUES('a','00000000000000FF',NULL,'selected.png','.png',0,32,1,100,1,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('b','00000000000000FF',NULL,'other.png','.png',0,32,1,100,1,133000000000000003);
                """);
            await queue.SetPolicyAsync(all);
            var chosen = new FileFactJob(new("a", "00000000000000FF"), FileFactKind.ImageDimensions, 10);
            await queue.EnqueueAsync([chosen with { ExtractorVersion = 9 }, chosen,
                chosen with { Identity = new("b", "00000000000000FF") }]);
            var selection = new FileFactClaimSpecification([new(FileFactKind.ImageDimensions, 10)], "a");
            lease = (await queue.ClaimAsync(specification: selection))!;
            TestAssert.Equal(chosen, lease.Job, "selection limits the active reader version and volume without changing configured policy");
            await queue.CompleteAsync(lease.LeaseId, Observation(lease));
            TestAssert.True(await queue.ClaimAsync(specification: selection) is null, "other versions and volumes are not dispatched into this reader");
            await TestAssert.ThrowsAsync<ArgumentException>(() => queue.ClaimAsync(specification: new([], "a")), "empty reader selection is rejected");
            var ledger = new FileFactQueueDiagnostics(path, clock);
            TestAssert.Equal(0L, (await ledger.ReadAsync(FileFactKind.ImageDimensions, 10, volumeId: "a")).PendingJobs, "volume-specific ledger excludes another drive");
            await ExecuteAsync(path, "UPDATE catalog_volumes_v2 SET state = 'offline' WHERE volume_id = 'b';");
            var offline = await ledger.ReadAsync(FileFactKind.ImageDimensions, 10, volumeId: "b");
            TestAssert.Equal("b", offline.UnavailableVolumeIds!.Single(), "an unavailable volume is distinct from a completed empty queue");
            await TestAssert.ThrowsAsync<ArgumentException>(() => ledger.ReadAsync(FileFactKind.ImageDimensions, 10, volumeId: "unknown"), "unknown volume cannot bypass configured order");
            TestAssert.True(await new CatalogV2Database(path).CheckIntegrityAsync(), "queue catalog remains integral");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }

    private static FileFactJob Job(string volume, string reference) => new(new(volume, reference), FileFactKind.ImageDimensions, 1);
    private static FileFactObservation Observation(FileFactLease lease) => new(lease.Job.Identity, lease.Source,
        lease.Job.Kind, lease.Job.ExtractorVersion, FileFactState.Indexed, 640, 480);
    private static async Task ExecuteAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection($"Data Source={path};Pooling=False");
        await connection.OpenAsync();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync();
    }
    private sealed class ManualClock : TimeProvider
    {
        private DateTimeOffset now = DateTimeOffset.FromUnixTimeMilliseconds(1_000_000);
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(long milliseconds) => now = now.AddMilliseconds(milliseconds);
    }
}
