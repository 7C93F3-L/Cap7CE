using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactOwnedPolicyTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-owned-policy-" + Guid.NewGuid().ToString("N"));
        var ownedPath = Path.Combine(root, "owned", "Cap7CE"); var personalPath = Path.Combine(root, "personal", "Cap7CE");
        Directory.CreateDirectory(ownedPath); Directory.CreateDirectory(personalPath);
        var ownFile = Path.Combine(ownedPath, "own.json"); var personalFile = Path.Combine(personalPath, "personal.json");
        await File.WriteAllTextAsync(ownFile, "{}"); await File.WriteAllTextAsync(personalFile, "{}");
        try {
            var ownRoot = NativeFileFactSourceGuard.CaptureDirectory(ownedPath)!;
            var personalRoot = NativeFileFactSourceGuard.CaptureDirectory(personalPath)!;
            var own = NativeFileFactSourceGuard.Capture(ownFile)!; var personal = NativeFileFactSourceGuard.Capture(personalFile)!;
            var path = Path.Combine(root, "fixture.db"); var catalog = new CatalogV2Database(path); await catalog.InitializeAsync();
            await using (var connection = new SqliteConnection("Data Source=" + path)) {
                await connection.OpenAsync(); using var command = connection.CreateCommand();
                command.CommandText = """
                    INSERT INTO catalog_volumes_v2 VALUES($volume,$drive,'NTFS',1,NULL,NULL,NULL,NULL,'ready',0,NULL,0);
                    INSERT INTO catalog_nodes_v2 VALUES($volume,$ownroot,NULL,'Cap7CE','',1,16,1,0,1,1);
                    INSERT INTO catalog_nodes_v2 VALUES($volume,$personalroot,NULL,'Cap7CE','',1,16,1,0,1,1);
                    INSERT INTO catalog_directory_paths_v2 VALUES($volume,$ownroot,$ownpath);
                    INSERT INTO catalog_directory_paths_v2 VALUES($volume,$personalroot,$personalpath);
                    INSERT INTO catalog_nodes_v2 VALUES($volume,$own,$ownroot,'own.json','.json',0,32,1,$ownsize,1,$owntime);
                    INSERT INTO catalog_nodes_v2 VALUES($volume,$personal,$personalroot,'personal.json','.json',0,32,1,$personalsize,1,$personaltime);
                    """;
                command.Parameters.AddWithValue("$volume", ownRoot.VolumeId); command.Parameters.AddWithValue("$drive", ownedPath[..2]);
                command.Parameters.AddWithValue("$ownroot", ownRoot.FileReference); command.Parameters.AddWithValue("$personalroot", personalRoot.FileReference);
                command.Parameters.AddWithValue("$ownpath", ownedPath[3..]); command.Parameters.AddWithValue("$personalpath", personalPath[3..]);
                command.Parameters.AddWithValue("$own", own.Identity.FileReference); command.Parameters.AddWithValue("$personal", personal.Identity.FileReference);
                command.Parameters.AddWithValue("$ownsize", own.SizeBytes); command.Parameters.AddWithValue("$personalsize", personal.SizeBytes);
                command.Parameters.AddWithValue("$owntime", own.ModifiedFileTime); command.Parameters.AddWithValue("$personaltime", personal.ModifiedFileTime);
                await command.ExecuteNonQueryAsync();
            }
            IReadOnlyList<FileFactOwnedStorageRoot> roots = [];
            var resolves = 0;
            var session = new FileFactHostSession(path, resolveOwnedStorage: token => { resolves++; return Task.FromResult(roots); });
            FileFactQueuePolicy requested = new([ownRoot.VolumeId], [new(ownRoot.VolumeId)], []);
            TestAssert.Equal("inactive", (await session.ReadStatusAsync(new(FileFactKind.TextData, 2), CancellationToken.None)).State, "ungranted status remains passive");
            TestAssert.Equal(0, resolves, "ungranted status cannot invoke owned-source resolver");
            await session.ConfigureAsync(new(true, requested), CancellationToken.None);
            var initial = await session.DiscoverAsync(new(FileFactKind.TextData, 2, [".json"]), CancellationToken.None);
            TestAssert.Equal(2, initial.Jobs.Count, "generated initial scope starts without a ready owned root");
            roots = [new(ownedPath, ownRoot)];
            var claimed = await session.ClaimAsync(CancellationToken.None, new([new(FileFactKind.TextData, 2)]));
            TestAssert.Equal(FileFactClaimState.Ready, claimed.State, "ready root exclusion does not block a same-named personal directory");
            TestAssert.Equal(personal.Identity, claimed.Ticket!.Lease.Job.Identity, "previously queued own job cannot leak through claim when root becomes ready");
            TestAssert.Equal(personalFile, claimed.Ticket.FullPath, "only actual personal fixture path reaches extractor");
            TestAssert.Equal(0, requested.Excludes.Count, "implicit exclusions never mutate user grant");
            var before = (await session.ReadStatusAsync(new(FileFactKind.TextData, 2), CancellationToken.None)).Ledger!;
            var discovered = await session.DiscoverAsync(new(FileFactKind.TextData, 2, [".json"]), CancellationToken.None);
            TestAssert.Equal(1, discovered.Jobs.Count, "subsequent discoveries use effective owned exclusion");
            var after = (await session.ReadStatusAsync(new(FileFactKind.TextData, 2), CancellationToken.None)).Ledger!;
            TestAssert.Equal(before.PolicyEpoch, after.PolicyEpoch, "unchanged effective roots do not revoke leases or bump epoch per request");
            roots = [new(ownedPath, ownRoot), new(personalPath, personalRoot)];
            var completed = await session.CompleteAsync(new(claimed.Ticket.Lease.LeaseId, new(FileFactState.Failed, ErrorCode: "fixture")), CancellationToken.None);
            TestAssert.Equal(FileFactBrokerCompletion.LeaseLost, completed, "new implicit exclusion revokes old lease before publishing result");
            TestAssert.Equal(FileFactClaimState.Empty, (await session.ClaimAsync(CancellationToken.None)).State, "excluded pending records stay undispatched");
            await session.PauseAsync(CancellationToken.None); var passive = resolves;
            await session.ReadStatusAsync(new(FileFactKind.TextData, 2), CancellationToken.None);
            TestAssert.Equal(passive, resolves, "paused status does not refresh scope or write queue");
            roots = [new(ownedPath, ownRoot)]; await session.ConfigureAsync(new(true, requested), CancellationToken.None);
            Directory.Move(ownedPath, ownedPath + "-old"); Directory.CreateDirectory(ownedPath);
            await TestAssert.ThrowsAsync<CoreProtocolException>(() => session.ClaimAsync(CancellationToken.None), "physical root rebound fails before any extraction ticket");
            Directory.Delete(ownedPath); Directory.Move(ownedPath + "-old", ownedPath);
            await session.PauseAsync(CancellationToken.None);
            TestAssert.Equal("{}", await File.ReadAllTextAsync(ownFile), "own fixture bytes preserved");
            TestAssert.Equal("{}", await File.ReadAllTextAsync(personalFile), "personal fixture bytes preserved");
            TestAssert.True(await catalog.CheckIntegrityAsync(), "implicit owned policy integrity");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
}
