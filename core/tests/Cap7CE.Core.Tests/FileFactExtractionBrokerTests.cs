using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataExtraction;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactExtractionBrokerTests
{
    public static async Task RunAsync()
    {
        if (!OperatingSystem.IsWindows()) return;
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-extraction-broker-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var sourcePath = Path.Combine(root, "中文源.png");
        var databasePath = Path.Combine(root, "fixture.db");
        try
        {
            await File.WriteAllBytesAsync(sourcePath, [1, 2, 3, 4]);
            var native = NativeFileFactSourceGuard.Capture(sourcePath)!;
            var catalog = new CatalogV2Database(databasePath);
            await catalog.InitializeAsync();
            await using (var connection = new SqliteConnection($"Data Source={databasePath};Pooling=False"))
            {
                await connection.OpenAsync(); using var command = connection.CreateCommand();
                command.CommandText = """
                    INSERT INTO catalog_volumes_v2 VALUES($volume,$drive,'NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                    INSERT INTO catalog_nodes_v2 VALUES($volume,'0000000000000001',NULL,'fixture','',1,16,1,0,1,1);
                    INSERT INTO catalog_directory_paths_v2 VALUES($volume,'0000000000000001',$relative);
                    INSERT INTO catalog_nodes_v2 VALUES($volume,$reference,'0000000000000001','中文源.png','.png',0,32,1,$size,1,$modified);
                    """;
                command.Parameters.AddWithValue("$volume", native.Identity.VolumeId);
                command.Parameters.AddWithValue("$drive", Path.GetPathRoot(sourcePath)![..2]);
                command.Parameters.AddWithValue("$relative", root[3..]);
                command.Parameters.AddWithValue("$reference", native.Identity.FileReference);
                command.Parameters.AddWithValue("$size", native.SizeBytes);
                command.Parameters.AddWithValue("$modified", native.ModifiedFileTime);
                await command.ExecuteNonQueryAsync();
            }
            await FileFactHostSessionTests.RunAsync(databasePath, native.Identity);
            var clock = new ManualClock();
            var broker = new FileFactExtractionBroker(databasePath, timeProvider: clock);
            await broker.InitializeAsync();
            var policy = new FileFactQueuePolicy([native.Identity.VolumeId], [new(native.Identity.VolumeId)], []);
            var job = new FileFactJob(native.Identity, FileFactKind.ImageDimensions, 1);
            await broker.EnqueueAsync([job]);
            TestAssert.Equal(FileFactClaimState.Empty, (await broker.ClaimAsync()).State, "broker default does not dispatch without consent policy");
            await broker.SetPolicyAsync(policy);
            var diagnostics = new FileFactQueueDiagnostics(databasePath, clock);
            TestAssert.Equal(1L, (await diagnostics.ReadAsync(FileFactKind.ImageDimensions, 1)).PendingJobs,
                "queue ledger includes only current-policy pending jobs");
            var first = (await broker.ClaimAsync()).Ticket!;
            TestAssert.Equal(sourcePath, first.FullPath, "broker only returns verified Catalog path");
            TestAssert.Equal(FileFactClaimState.Busy, (await broker.ClaimAsync()).State, "broker limits in-flight extraction");
            var leased = await diagnostics.ReadAsync(FileFactKind.ImageDimensions, 1);
            TestAssert.True(leased.LeasedJobs == 1 && leased.PendingJobs == 0 && leased.NextLeaseExpiryUnixMilliseconds is not null,
                "ledger distinguishes active persisted lease from no ready jobs");
            TestAssert.True(await broker.RenewAsync(first.Lease.LeaseId), "owned active lease can renew");
            TestAssert.Equal(FileFactBrokerCompletion.LeaseLost, await broker.CompleteAsync("not-owned", new(FileFactState.Indexed, 1, 1)),
                "arbitrary client token cannot publish");
            // Rename is intentionally not cached as a permanent extraction failure.
            var moved = Path.Combine(root, "重命名.png"); File.Move(sourcePath, moved);
            TestAssert.Equal(FileFactBrokerCompletion.SourceDeferred, await broker.CompleteAsync(first.Lease.LeaseId,
                new(FileFactState.Indexed, 800, 600, IsAnimated: true)), "physical source loss blocks even plausible scalar results");
            var facts = new FileFactDatabase(databasePath);
            TestAssert.True(await facts.ReadCurrentAsync(native.Identity, FileFactKind.ImageDimensions, 1) is null,
                "source gate failures never become permanent metadata failures");
            await UpdateNodeAsync(databasePath, native.Identity, "重命名.png", native);
            clock.Advance();
            var expired = await diagnostics.ReadAsync(FileFactKind.ImageDimensions, 1);
            TestAssert.True(expired.PendingJobs == 1 && expired.LeasedJobs == 0 && expired.NextLeaseExpiryUnixMilliseconds is null,
                "expired leases count as recoverable pending even before next claim");
            var renamed = (await broker.ClaimAsync()).Ticket!;
            TestAssert.Equal(moved, renamed.FullPath, "expired deferred lease recovers through the updated Catalog path");
            var properties = FileFactImageMetrics.Names.ToDictionary(name => name, _ => 0);
            properties["colorRatio.red"] = 10000;
            TestAssert.Equal(FileFactBrokerCompletion.Published, await broker.CompleteAsync(renamed.Lease.LeaseId,
                new(FileFactState.Indexed, 800, 600, IsAnimated: true, VisualProperties: properties)), "verified ordinary source publishes through durable queue");
            var imageDetails = (await facts.ReadCurrentAsync(native.Identity, FileFactKind.ImageDimensions, 1))!;
            TestAssert.Equal(true, imageDetails.IsAnimated, "broker publishes animation through the protected lease");
            TestAssert.Equal(10000, imageDetails.VisualProperties!["colorRatio.red"], "broker publishes exact color metrics together with dimensions");
            TestAssert.Equal(1L, (await diagnostics.ReadAsync(FileFactKind.ImageDimensions, 1)).CompletedJobs,
                "published queue job appears in completed ledger");
            TestAssert.Equal(0L, (await diagnostics.ReadAsync(FileFactKind.ImageDimensions, 2)).CompletedJobs,
                "ledger never mixes extractor versions");
            await broker.EnqueueAsync([job]);
            TestAssert.Equal(FileFactClaimState.Empty, (await broker.ClaimAsync()).State, "published source is reused without new extraction");
            var video = job with { Kind = FileFactKind.Video };
            await broker.EnqueueAsync([video]);
            var active = (await broker.ClaimAsync()).Ticket!;
            await broker.SetPolicyAsync(policy with { Includes = [] });
            TestAssert.Equal(0L, (await diagnostics.ReadAsync(FileFactKind.ImageDimensions, 1)).CompletedJobs,
                "paused policy removes work from current-policy aggregate without deleting persisted jobs");
            TestAssert.Equal(FileFactBrokerCompletion.LeaseLost, await broker.CompleteAsync(active.Lease.LeaseId,
                new(FileFactState.Indexed, 800, 600, 1000)), "range changes revoke broker ownership");
            await broker.SetPolicyAsync(policy);
            await File.WriteAllBytesAsync(moved, [1, 2, 3, 4, 5]);
            var deferred = await broker.ClaimAsync();
            TestAssert.Equal(FileFactClaimState.SourceDeferred, deferred.State, "physical write before Catalog catch-up blocks dispatch");
            TestAssert.True(deferred.Ticket is null && deferred.RetryAfterUnixMilliseconds is not null,
                "unverified path is never returned to extractor and retry has finite lease deadline");
            var changed = NativeFileFactSourceGuard.Capture(moved)!;
            await UpdateNodeAsync(databasePath, native.Identity, "重命名.png", changed);
            clock.Advance();
            var caughtUp = (await broker.ClaimAsync()).Ticket!;
            TestAssert.Equal(5L, caughtUp.Lease.Source.SizeBytes, "recovered dispatch captures current source version");
            TestAssert.Equal(FileFactBrokerCompletion.Published, await broker.CompleteAsync(caughtUp.Lease.LeaseId,
                new(FileFactState.Failed, ErrorCode: "fixture-unsupported")), "verified extractor failure is cached separately from path failure");
            TestAssert.Equal(FileFactState.Failed, (await facts.ReadCurrentAsync(native.Identity, FileFactKind.Video, 1))!.State,
                "broker preserves versioned extractor failure");
            TestAssert.True((await File.ReadAllBytesAsync(moved)).SequenceEqual(new byte[] { 1, 2, 3, 4, 5 }),
                "broker never writes source content");
            await broker.EnqueueAsync([new(native.Identity, FileFactKind.Audio, 1)]);
            var audioTicket = (await broker.ClaimAsync()).Ticket!;
            TestAssert.Equal(FileFactKind.Audio, audioTicket.Lease.Job.Kind, "broker dispatches audio under same physical gate");
            TestAssert.Equal(FileFactBrokerCompletion.Published, await broker.CompleteAsync(audioTicket.Lease.LeaseId,
                new(FileFactState.Indexed, DurationMilliseconds: 500, ChannelCount: 2)), "audio completion publishes atomically");
            TestAssert.Equal(2, (await facts.ReadCurrentAsync(native.Identity, FileFactKind.Audio, 1))!.ChannelCount,
                "broker maps channels into current audio fact");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }

    private static async Task UpdateNodeAsync(string path, CatalogEntryIdentity identity, string name, NativeFileFactSource physical)
    {
        await using var connection = new SqliteConnection($"Data Source={path};Pooling=False");
        await connection.OpenAsync(); using var command = connection.CreateCommand();
        command.CommandText = "UPDATE catalog_nodes_v2 SET name=$name, size_bytes=$size, modified_utc_ticks=$modified WHERE volume_id=$volume AND file_reference=$reference;";
        command.Parameters.AddWithValue("$name", name); command.Parameters.AddWithValue("$size", physical.SizeBytes);
        command.Parameters.AddWithValue("$modified", physical.ModifiedFileTime);
        command.Parameters.AddWithValue("$volume", identity.VolumeId); command.Parameters.AddWithValue("$reference", identity.FileReference);
        await command.ExecuteNonQueryAsync();
    }
    private sealed class ManualClock : TimeProvider
    {
        private DateTimeOffset now = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance() => now = now.AddSeconds(31);
    }
}
