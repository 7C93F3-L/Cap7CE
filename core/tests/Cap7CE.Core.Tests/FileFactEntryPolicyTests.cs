using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Protocol;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactEntryPolicyTests
{
    public static async Task RunAsync()
    {
        using var fixture = new TemporaryCatalogFixture(); var catalog = new CatalogV2Database(fixture.DatabasePath); await catalog.InitializeAsync();
        await using (var connection = new SqliteConnection($"Data Source={fixture.DatabasePath};Pooling=False")) {
            await connection.OpenAsync(); using var command = connection.CreateCommand();
            command.CommandText = """
                INSERT INTO catalog_volumes_v2 VALUES('links','X:','NTFS',1,'1',1,0,0,'ready',4,4,0);
                INSERT INTO catalog_nodes_v2 VALUES
                ('links','0000000000000010',NULL,'allowed','',1,16,1,NULL,1,2),
                ('links','0000000000000011',NULL,'other','',1,16,1,NULL,1,2),
                ('links','0000000000000012',NULL,'excluded','',1,16,1,NULL,1,2),
                ('links','0000000000000020','0000000000000011','source.txt','.txt',0,32,1,10,1,2);
                INSERT INTO catalog_directory_paths_v2 VALUES('links','0000000000000010','allowed'),
                ('links','0000000000000011','other'),('links','0000000000000012','excluded');
                """;
            await command.ExecuteNonQueryAsync();
        }
        var identity = new CatalogEntryIdentity("links", "0000000000000020");
        var names = new CatalogFileName[] { new("0000000000000010", "first.png"), new("0000000000000010", "second.png"), new("0000000000000011", "source.txt") };
        var store = new CatalogFileEntryStore(catalog); await store.InitializeAsync(); await store.ReplaceAsync(identity, new(1, 2, 10), 0, names);
        var queue = new FileFactQueue(fixture.DatabasePath); await queue.InitializeAsync();
        var policy = new FileFactQueuePolicy(["links"], [new("links", "0000000000000010")], [new("links", "0000000000000012")]);
        await queue.SetPolicyAsync(policy);
        var discovery = new FileFactDiscovery(fixture.DatabasePath);
        var jobs = (await discovery.ReadPageAsync(policy, FileFactKind.ImageDimensions, 1, [".png"])).Jobs;
        TestAssert.Equal(1, jobs.Count, "included PNG aliases discover one physical job despite a TXT canonical name");
        TestAssert.Equal(".png", jobs.Single().PreferredExtension, "source format follows the eligible entry");
        TestAssert.False(CoreProtocolJson.ToElement(jobs.Single()).TryGetProperty("preferredExtension", out _), "internal source hints never become client authority");
        var changed = new FileFactCatalogChange(1, new("links", "0000000000000010"), true);
        TestAssert.Equal(1, (await discovery.ReadChangedPageAsync(policy, FileFactKind.ImageDimensions, 1, [".png"], changed)).Jobs.Count, "changed-folder discovery includes noncanonical paths");
        await queue.EnqueueAsync(jobs);
        var lease = (await queue.ClaimAsync())!;
        var resolver = new FileFactSourceResolver(fixture.DatabasePath);
        var source = (await resolver.ResolveForLeaseAsync(lease))!;
        TestAssert.True(source.FullPath.StartsWith("X:\\allowed\\") && source.FullPath.EndsWith(".png"), "leased source matches allowed range and discovered format");
        TestAssert.True(await resolver.IsAuthorizedAsync(source, lease), "owned exact path remains authorized");
        var reopened = new FileFactSourceResolver(fixture.DatabasePath);
        TestAssert.Equal(source, await reopened.ResolveForLeaseAsync(lease), "source format hint survives reopen");
        await store.ReplaceAsync(identity, new(1, 2, 10), 1, [..names, new("0000000000000012", "excluded.txt")]);
        TestAssert.Equal(0, (await discovery.ReadPageAsync(policy, FileFactKind.ImageDimensions, 1, [".png"])).Jobs.Count, "any excluded alias blocks physical discovery");
        TestAssert.True(await resolver.ResolveForLeaseAsync(lease) is null, "a permitted alias cannot bypass another excluded alias");
        TestAssert.False(await queue.RenewAsync(lease.LeaseId), "new excluded alias revokes renewal without changing the policy epoch");
        TestAssert.Equal(FileFactCompletion.LeaseLost, await queue.CompleteAsync(lease.LeaseId,
            new(identity, lease.Source, FileFactKind.ImageDimensions, 1, FileFactState.Indexed, 640, 480)), "completion rechecks all names in the commit transaction");
        var ledger = await new FileFactQueueDiagnostics(fixture.DatabasePath).ReadAsync(FileFactKind.ImageDimensions, 1);
        TestAssert.Equal(0L, ledger.LeasedJobs, "excluded physical jobs do not inflate active-policy progress");
        await store.ReplaceAsync(identity, new(1, 2, 10), 2, names);
        TestAssert.True(await queue.RenewAsync(lease.LeaseId), "removing the excluded alias restores current eligibility");
        TestAssert.Equal(FileFactCompletion.Published, await queue.CompleteAsync(lease.LeaseId,
            new(identity, lease.Source, FileFactKind.ImageDimensions, 1, FileFactState.Indexed, 640, 480)), "permitted physical source publishes once");
        var facts = new FileFactDatabase(fixture.DatabasePath);
        TestAssert.True(await facts.ReadCurrentAsync(identity, FileFactKind.ImageDimensions, 1) is not null, "aliases share the one published result");
    }
}
