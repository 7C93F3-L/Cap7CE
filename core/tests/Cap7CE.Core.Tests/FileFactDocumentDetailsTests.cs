using Cap7CE.Core.Catalog;
using Cap7CE.Core.Catalog.FileFacts;
using Microsoft.Data.Sqlite;

namespace Cap7CE.Core.Tests;

internal static class FileFactDocumentDetailsTests
{
    public static async Task RunAsync()
    {
        var root = Path.Combine(Path.GetTempPath(), "Cap7CE-document-details-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); var path = Path.Combine(root, "fixture.db");
        try
        {
            var catalog = new CatalogV2Database(path); await catalog.InitializeAsync();
            var facts = new FileFactDatabase(path); await facts.InitializeAsync();
            await ExecuteAsync(path, """
                INSERT INTO catalog_volumes_v2 VALUES('fixture','X:','NTFS',1,NULL,NULL,NULL,NULL,'ready',1,1,0);
                INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000001',NULL,'one.pdf','.pdf',0,32,1,100,133000000000000001,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000002',NULL,'two.pdf','.pdf',0,32,1,100,133000000000000001,133000000000000003);
                INSERT INTO catalog_nodes_v2 VALUES('fixture','0000000000000003',NULL,'three.psd','.psd',0,32,1,100,133000000000000001,133000000000000003);
                """);
            var identity = new CatalogEntryIdentity("fixture", "0000000000000001");
            var other = new CatalogEntryIdentity("fixture", "0000000000000002");
            var artboard = new CatalogEntryIdentity("fixture", "0000000000000003");
            var observation = new FileFactObservation(identity, (await facts.CaptureAsync(identity))!, FileFactKind.Document, 2,
                FileFactState.Indexed, DocumentProperties: new(10, "pages", false));
            await facts.PublishAsync(observation);
            await facts.PublishAsync(observation with { Identity = other, Source = (await facts.CaptureAsync(other))!, DocumentProperties = new(100, "slides") });
            await facts.PublishAsync(observation with { Identity = artboard, Source = (await facts.CaptureAsync(artboard))!, DocumentProperties = new(ArtboardCount: 0) });
            TestAssert.Equal(observation.DocumentProperties, (await new FileFactDatabase(path).ReadCurrentAsync(identity, FileFactKind.Document, 2))!.DocumentProperties, "document known false survives reopening");
            TestAssert.True((await facts.ReadCurrentAsync(other, FileFactKind.Document, 2))!.DocumentProperties!.HasEmbeddedImages is null, "unknown image composition remains null");
            var filter = new FileFactQueryFilter(FileFactKind.Document, 2);
            var query = new CatalogV2Query("", [], CatalogQueryScope.AllVolumes(), null, CatalogEntryType.File, 1, null, filter);
            var first = await catalog.QueryAsync(query);
            TestAssert.True(first.Next is not null, "document details page without dimensions");
            TestAssert.Equal(artboard, (await catalog.QueryAsync(query with { After = first.Next })).Items.Single().Identity, "document keyset follows name ordering");
            TestAssert.Equal(identity, (await catalog.QueryAsync(query with { Facts = filter with { Document = new(MinimumContentCount: 2, MaximumContentCount: 10, HasEmbeddedImages: false) } })).Items.Single().Identity, "known no images intersects content band");
            TestAssert.Equal(0, (await catalog.QueryAsync(query with { Facts = filter with { Document = new(MinimumContentCount: 11, HasEmbeddedImages: false) } })).Items.Count, "unknown images cannot match no images");
            TestAssert.Equal(artboard, (await catalog.QueryAsync(query with { Facts = filter with { Document = new(MaximumArtboardCount: 0) } })).Items.Single().Identity, "known zero artboards differs from absent metadata");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { DocumentProperties = new() }), "empty detail vector rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { DocumentProperties = new(12) }), "count kind must accompany content count");
            await TestAssert.ThrowsAsync<ArgumentException>(() => facts.PublishAsync(observation with { Kind = FileFactKind.Audio }), "document vector cannot attach to audio");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(query with { Facts = filter with { MinimumWidth = 1 } }), "document width rejected");
            await TestAssert.ThrowsAsync<ArgumentException>(() => catalog.QueryAsync(query with { Facts = filter with { Document = new(MinimumContentCount: 11, MaximumContentCount: 10) } }), "reversed document band rejected");
            var revision = await facts.ReadRevisionAsync();
            await ExecuteAsync(path, "CREATE TRIGGER abort_document_details BEFORE INSERT ON file_fact_document_details BEGIN SELECT RAISE(ABORT,'test failure'); END;");
            await TestAssert.ThrowsAsync<SqliteException>(() => facts.PublishAsync(observation with { ExtractorVersion = 3 }), "document publication is atomic");
            TestAssert.Equal(observation.DocumentProperties, (await facts.ReadCurrentAsync(identity, FileFactKind.Document, 2))!.DocumentProperties, "document rollback retains previous version");
            TestAssert.Equal(revision, await facts.ReadRevisionAsync(), "document revision rolls back");
            await ExecuteAsync(path, "DROP TRIGGER abort_document_details;");
            await facts.PublishAsync(observation with { State = FileFactState.Failed, DocumentProperties = null, ErrorCode = "fixture-failed" });
            TestAssert.True((await facts.ReadCurrentAsync(identity, FileFactKind.Document, 2))!.DocumentProperties is null, "failed replacement clears document details");
            await facts.InvalidateVolumeAsync("fixture");
            TestAssert.Equal(0, (await catalog.QueryAsync(query)).Items.Count, "source fence invalidates document vector");
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
    private static async Task ExecuteAsync(string path, string sql)
    {
        await using var connection = new SqliteConnection("Data Source=" + path); await connection.OpenAsync();
        using var command = connection.CreateCommand(); command.CommandText = sql; await command.ExecuteNonQueryAsync();
    }
}
