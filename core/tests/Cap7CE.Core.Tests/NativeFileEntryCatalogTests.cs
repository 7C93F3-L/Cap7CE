using System.Runtime.InteropServices;
using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.DirectoryEntries;
using Cap7CE.Core.Catalog.FileFacts;
using Cap7CE.Core.Host.MetadataExtraction;
using Cap7CE.Core.Host;
using Cap7CE.Core.Reader.Host;
using Cap7CE.Core.Reader.Protocol;
using Microsoft.Data.Sqlite;
using Microsoft.Win32.SafeHandles;

namespace Cap7CE.Core.Tests;

internal static class NativeFileEntryCatalogTests
{
    public static async Task RunAsync()
    {
        if (!OperatingSystem.IsWindows()) return;
        using var fixture = new TemporaryCatalogFixture();
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-entry-flow-" + Guid.NewGuid().ToString("N"));
        var first = Path.Combine(root, "one"); var second = Path.Combine(root, "two");
        Directory.CreateDirectory(first); Directory.CreateDirectory(second);
        try {
            var original = Path.Combine(first, "original.txt"); var alias = Path.Combine(second, "alias.txt");
            await File.WriteAllTextAsync(original, "owned synthetic Core metadata fixture");
            TestAssert.True(CreateHardLinkW(alias, original, IntPtr.Zero), "create private alias for end-to-end contract");
            var observed = NativeFileEntryReader.Read(original)!;
            var one = NativeFileFactSourceGuard.CaptureDirectory(first)!; var two = NativeFileFactSourceGuard.CaptureDirectory(second)!;
            var source = observed.Source; var catalog = new CatalogV2Database(fixture.DatabasePath); await catalog.InitializeAsync();
            var created = File.GetCreationTimeUtc(original).ToFileTimeUtc();
            await using (var connection = new SqliteConnection($"Data Source={fixture.DatabasePath};Pooling=False")) {
                await connection.OpenAsync(); using var command = connection.CreateCommand();
                command.CommandText = """
                    INSERT INTO catalog_volumes_v2 VALUES($volume,$drive,'NTFS',1,'1',1,0,0,'ready',3,3,0);
                    INSERT INTO catalog_nodes_v2 VALUES
                    ($volume,$one,NULL,'one','',1,16,1,NULL,1,2),
                    ($volume,$two,NULL,'two','',1,16,1,NULL,1,2),
                    ($volume,$file,$one,'original.txt','.txt',0,32,1,$size,$created,$modified);
                    INSERT INTO catalog_directory_paths_v2 VALUES($volume,$one,$onePath),($volume,$two,$twoPath);
                    """;
                foreach (var (name, value) in new (string, object)[] { ("$volume",source.Identity.VolumeId), ("$drive",original[..2]),
                    ("$one",one.FileReference), ("$two",two.FileReference), ("$file",source.Identity.FileReference),
                    ("$size",source.SizeBytes), ("$created",created), ("$modified",source.ModifiedFileTime),
                    ("$onePath",first[3..]), ("$twoPath",second[3..]) }) command.Parameters.AddWithValue(name,value);
                await command.ExecuteNonQueryAsync();
            }
            var store = new CatalogFileEntryStore(catalog); await store.InitializeAsync();
            var version = new CatalogFileEntrySource(created, source.ModifiedFileTime, source.SizeBytes);
            await store.ReplaceAsync(source.Identity, version, 0, await ReadThroughReaderAsync(original, observed));
            TestAssert.Equal("alias.txt", (await catalog.GetChildrenAsync(two, 20)).Items.Single().Name, "real alias appears in its actual directory");
            TestAssert.Equal("original.txt", (await catalog.GetChildrenAsync(one, 20)).Items.Single().Name, "original entry remains visible in its own directory");
            var facts = new FileFactDatabase(fixture.DatabasePath); await facts.InitializeAsync();
            var factSource = (await facts.CaptureAsync(source.Identity))!;
            await facts.PublishAsync(new(source.Identity, factSource, FileFactKind.ImageDimensions, 1, FileFactState.Indexed, 640, 480));
            File.Delete(original);
            var remaining = NativeFileEntryReader.Read(alias)!;
            TestAssert.Equal(source.Identity, remaining.Source.Identity, "removing original name preserves physical identity");
            await store.ReplaceAsync(source.Identity, version, 1, await ReadThroughReaderAsync(alias, remaining));
            TestAssert.Equal(0, (await catalog.GetChildrenAsync(one, 20)).Items.Count, "removed link disappears without deleting remaining alias");
            TestAssert.Equal(1, (await catalog.GetChildrenAsync(two, 20)).Items.Count, "remaining link is still queryable");
            var resolved = (await new FileFactSourceResolver(fixture.DatabasePath).ResolveAsync(source.Identity))!;
            TestAssert.Equal(alias, resolved.FullPath, "fact source can use remaining alias after canonical name is gone");
            TestAssert.True(NativeFileFactSourceGuard.Matches(resolved), "resolved remaining name retains native identity and source fence");
            TestAssert.True(await facts.ReadCurrentAsync(source.Identity, FileFactKind.ImageDimensions, 1) is not null, "link removal reuses current facts");
            TestAssert.Equal("owned synthetic Core metadata fixture", await File.ReadAllTextAsync(alias), "remaining source bytes are intact");
            var pngAlias = Path.Combine(first, "usable.png");
            TestAssert.True(CreateHardLinkW(pngAlias, alias, IntPtr.Zero), "create private differently named format alias");
            var now = NativeFileEntryReader.Read(pngAlias)!;
            await store.ReplaceAsync(source.Identity, version, 2, now.Entries);
            var policy = new FileFactQueuePolicy([source.Identity.VolumeId], [new(one.VolumeId, one.FileReference)], []);
            var jobs = (await new FileFactDiscovery(fixture.DatabasePath).ReadPageAsync(policy, FileFactKind.ImageDimensions, 2, [".png"])).Jobs;
            var broker = new FileFactExtractionBroker(fixture.DatabasePath); await broker.InitializeAsync(); await broker.SetPolicyAsync(policy); await broker.EnqueueAsync(jobs);
            var ticket = (await broker.ClaimAsync()).Ticket!;
            TestAssert.Equal(pngAlias, ticket.FullPath, "ordinary broker reads the allowed PNG alias instead of canonical or excluded TXT names");
            TestAssert.True(await broker.RenewAsync(ticket.Lease.LeaseId), "allowed actual alias renews through native and policy guards");
            await store.ReplaceAsync(source.Identity, version, 3, [new(two.FileReference, "alias.txt")]);
            TestAssert.False(await broker.RenewAsync(ticket.Lease.LeaseId), "removing the allowed entry revokes a live worker grant");
            TestAssert.Equal(FileFactBrokerCompletion.LeaseLost, await broker.CompleteAsync(ticket.Lease.LeaseId, new(FileFactState.Indexed, 1, 1)), "revoked alias cannot publish through another path");
        } finally { Directory.Delete(root, recursive: true); }
    }

    private static async Task<IReadOnlyList<CatalogFileName>> ReadThroughReaderAsync(string path, NativeCatalogEntrySet reference)
    {
        using var handle = CreateFileW(path, 0x80, 7, IntPtr.Zero, 3, 0x00200000, IntPtr.Zero);
        var names = ReaderHardLinkMetadata.TryRead(handle, checked((uint)reference.Entries.Count), CancellationToken.None)!;
        TestAssert.True(names is not null, "real Reader metadata must produce a complete set before encoding");
        var id = Convert.ToUInt64(reference.Source.Identity.FileReference, 16);
        var file = new ReaderFileEntrySet(id, ReaderFileEntryState.Complete, checked((uint)names!.Count),
            checked((ulong)reference.Source.SizeBytes), File.GetCreationTimeUtc(path).ToFileTimeUtc(), reference.Source.ModifiedFileTime, names);
        var files = await ReaderFileEntryClient.ReadAsync(new(1, 2), [id], (request, token) => Task.FromResult(
            ReaderFrame.ResponseFor(ReaderFrame.RequestV2(ReaderOperation.FileEntryNames, 1,
                ReaderPayloadCodec.EncodeFileEntryBatchRequest(request)), ReaderStatus.Success, ReaderFrameFlags.EndOfStream,
                ReaderPayloadCodec.EncodeFileEntryBatchResponse(new(1, true, [file])))), CancellationToken.None);
        var result = files.Single().Names.Select(name => new CatalogFileName($"{name.ParentFileReference:X16}", name.Name)).ToArray();
        TestAssert.True(result.OrderBy(name => name.Name).SequenceEqual(reference.Entries.OrderBy(name => name.Name)),
            "native Reader through CR/2 and Core consumer agrees with independent Win32 reference");
        return result;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, ExactSpelling = true)]
    private static extern SafeFileHandle CreateFileW(string path, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreateHardLinkW(string newName, string existingName, IntPtr security);
}
