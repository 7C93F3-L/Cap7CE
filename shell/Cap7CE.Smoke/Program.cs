using Cap7CE.Core.Catalog;
using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Services;
using Microsoft.Data.Sqlite;

var root = Path.GetFullPath(args.Single());
var temporary = Path.Combine(Path.GetTempPath(), "Cap7CE-PhaseF-" + Guid.NewGuid().ToString("N"));
if (!Path.GetFullPath(temporary).StartsWith(Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new IOException("Fixture must stay inside the temporary directory");
Directory.CreateDirectory(temporary);
try
{
    var databasePath = Path.Combine(temporary, "fixture.db");
    var database = new CatalogV2Database(databasePath); await database.InitializeAsync();
    const string volume = "phase-f-fixture", directory = "0000000000000005";
    await database.RegisterVolumeAsync(volume, "S:", "NTFS", true);
    var nodes = new List<CatalogV2NodeRecord> { new(new(volume, directory), directory, ".", "", true, 16, true, null, 1, 2) };
    for (var i = 16; i < 267; i++) nodes.Add(new(new(volume, i.ToString("X16")), directory, $"asset-{i:D4}.png", ".png", false, 32, true, 10, 1, 2));
    await using (var snapshot = await database.BeginSnapshotBuildAsync(volume, "1", 1, 0, 0, nodes.Count, false))
    { await snapshot.AppendAsync(nodes); await snapshot.PublishAsync(); }
    var revision = await database.ReadRevisionAsync();
    await using (var core = await CoreConnection.StartAsync(root, databasePath))
    {
        var status = await core.RequestAsync<CatalogStatusResponse>(CoreOperations.CatalogStatus, new { });
        Require(status.Volumes.Single().Queryable, "fixture ready");
        var resolved = await core.RequestAsync<CatalogResolveScopeResponse>(CoreOperations.CatalogResolveScope, new CatalogResolveScopeRequest("S:\\"));
        Require(resolved.DirectoryFileReference == directory, "root resolution");
        var page = await core.RequestAsync<SearchPageResponse>(CoreOperations.SearchStart,
            new SearchStartRequest("asset", 100, CoreSearchSorts.NameAscending, [volume], new("direct-children", volume, directory)));
        var names = new HashSet<string>(page.Items.Select(item => item.Name));
        while (page.NextCursor is { } cursor)
        {
            page = await core.RequestAsync<SearchPageResponse>(CoreOperations.SearchNextPage, new SearchNextPageRequest(cursor));
            foreach (var item in page.Items) Require(names.Add(item.Name), "no duplicate page items");
        }
        Require(names.Count == 251, "all three pages");
        var probe = await core.RequestAsync<SearchPageResponse>(CoreOperations.SearchStart,
            new SearchStartRequest("asset", 1, CoreSearchSorts.NameAscending, [volume]));
        Require(probe.Items.Count == 1 && probe.NextCursor is not null, "bounded availability-style search returns one item without requesting the remaining pages");
        foreach (var denied in new[] { CoreOperations.CatalogBuild, CoreOperations.CatalogRebuild, CoreOperations.VolumeSelection, CoreOperations.KeywordsWrite, "metadata.build.attach" })
        {
            var rejected = false;
            try { await core.RequestAsync<object>(denied, new { }); } catch (IOException error) when (error.Message == CoreErrorCodes.InvalidRequest) { rejected = true; }
            Require(rejected, "mutating operation denied");
        }
        using var canceled = new CancellationTokenSource(); canceled.Cancel();
        try { await core.RequestAsync<SearchPageResponse>(CoreOperations.SearchStart, new SearchStartRequest("", 100, CoreSearchSorts.NameAscending, [volume]), canceled.Token); }
        catch (OperationCanceledException) { }
        Require((await core.RequestAsync<CatalogStatusResponse>(CoreOperations.CatalogStatus, new { })).Tasks.Count == 0, "no background tasks");
    }
    Require(revision == await database.ReadRevisionAsync(), "queries did not change Catalog");
    var png = Path.Combine(temporary, "fixture.png");
    await File.WriteAllBytesAsync(png, Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAIAAAAUMWhjAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAMElEQVRIiWPojvlGU8QwakHMaBB9G01F3aMZ7dtoUdE9WprGjFY43aNVZszgblUAANlOl0wagnzLAAAAAElFTkSuQmCC"));
    await using (var visuals = new VisualConnection(root))
    {
        var thumbnail = await visuals.PrepareAsync(png, false, CancellationToken.None);
        var preview = await visuals.PrepareAsync(png, true, CancellationToken.None);
        Require(new FileInfo(thumbnail).Length > 0 && new FileInfo(preview).Length > 0, "real Core thumbnail and preview");
    }
    Console.WriteLine("passed: authenticated Core, 251 items/3 pages, root scope, write denial, cancellation, unchanged revision, real thumbnail/preview, shutdown");
}
finally
{
    SqliteConnection.ClearAllPools();
    Directory.Delete(temporary, true);
}
static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
