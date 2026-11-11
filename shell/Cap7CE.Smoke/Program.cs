using Cap7CE.Core.Catalog;
using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Services;
using Microsoft.Data.Sqlite;

if(args.Length==2&&args[0]=="--worker-idle-probe"){await WorkerIdleProbe.RunAsync(args[1]);return;}
var root = Path.GetFullPath(args.Single());
NativeEntryPointProbe.Run(root);
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
    await using (var visuals = new VisualConnection(root,Path.Combine(temporary,"visual-cache")))
    {
        var browseRoot=Path.Combine(temporary,"unindexed");Directory.CreateDirectory(browseRoot);
        var nested=Directory.CreateDirectory(Path.Combine(browseRoot,"nested"));
        await File.WriteAllTextAsync(Path.Combine(nested.FullName,"deep.txt"),"not a recursive listing");
        for(var i=0;i<105;i++)await File.WriteAllTextAsync(Path.Combine(browseRoot,$"item-{i:D3}.txt"),"fixture");
        var hidden=Path.Combine(browseRoot,"hidden.txt");await File.WriteAllTextAsync(hidden,"hidden");File.SetAttributes(hidden,FileAttributes.Hidden);
        var browseId=Guid.NewGuid().ToString();
        var listing=await visuals.RequestAsync("directoryBrowse.start",browseId,browseRoot,new{sort="name-ascending",excludeHidden=true});
        Require(listing.GetProperty("entries").GetArrayLength()==100,"unindexed directory first page bounded to 100");
        var listed=new List<string>();
        while(true){
            listed.AddRange(listing.GetProperty("entries").EnumerateArray().Select(item=>item.GetProperty("name").GetString()!));
            var next=listing.GetProperty("nextCursor").GetString();if(next is null)break;
            listing=await visuals.RequestAsync("directoryBrowse.next",browseId,next);
        }
        Require(listed.Count==106&&listed.Distinct().Count()==106&&listed[0]=="nested"&&!listed.Contains("deep.txt")&&!listed.Contains("hidden.txt"),"unindexed browse pages, folder ordering, hidden exclusion and nonrecursive scope");
        var cancelledId=Guid.NewGuid().ToString();
        var cancelledPage=await visuals.RequestAsync("directoryBrowse.start",cancelledId,browseRoot,new{sort="name-descending",excludeHidden=false});
        await visuals.RequestAsync("directoryBrowse.cancel",cancelledId);
        var cursorRejected=false;
        try{await visuals.RequestAsync("directoryBrowse.next",cancelledId,cancelledPage.GetProperty("nextCursor").GetString());}catch(IOException){cursorRejected=true;}
        Require(cursorRejected,"leaving directory releases filesystem cursor");
        var recursiveId=Guid.NewGuid().ToString();
        var recursivePage=await visuals.RequestAsync("directoryBrowse.start",recursiveId,browseRoot,new{sort="name-ascending",excludeHidden=true,includeSubfolders=true});
        Require(recursivePage.GetProperty("entries").GetArrayLength()==100,"recursive first page bounded to 100");
        var recursiveNames=new List<string>();
        while(true){
            foreach(var entry in recursivePage.GetProperty("entries").EnumerateArray()){
                Require(entry.GetProperty("kind").GetString()=="file","recursive listing contains files");
                recursiveNames.Add(entry.GetProperty("name").GetString()!);
            }
            var next=recursivePage.GetProperty("nextCursor").GetString();if(next is null)break;
            recursivePage=await visuals.RequestAsync("directoryBrowse.next",recursiveId,next);
        }
        Require(recursiveNames.Count==106&&recursiveNames.Distinct().Count()==106&&recursiveNames.Contains("deep.txt")&&!recursiveNames.Contains("hidden.txt"),"recursive pages include descendants once and preserve hidden filtering");
        var cancelRoot=Directory.CreateDirectory(Path.Combine(temporary,"cancel-recursive"));
        for(var i=0;i<24;i++)Directory.CreateDirectory(Path.Combine(cancelRoot.FullName,$"child-{i}"));
        var runningId=Guid.NewGuid().ToString();
        var runningPage=visuals.RequestAsync("directoryBrowse.start",runningId,cancelRoot.FullName,new{sort="name-ascending",excludeHidden=false,includeSubfolders=true});
        await visuals.RequestAsync("directoryBrowse.cancel",runningId);
        var stopped=false;
        try{await runningPage;}catch(IOException error){stopped=error.Data["CoreMessage"]?.ToString()=="directory-browse-cancelled";}
        Require(stopped,"recursive traversal cancels while a page is being read");
        Console.WriteLine("passed: recursive filesystem pages, descendants, hidden filtering and active cancellation");
        Console.WriteLine("passed: unindexed filesystem browse, bounded pagination, hidden items, nonrecursive scope, cancellation");
        var thumbnail = await visuals.PrepareAsync(png, false, CancellationToken.None);
        var preview = await visuals.PrepareAsync(png, true, CancellationToken.None);
        Require(new FileInfo(thumbnail).Length > 0 && new FileInfo(preview).Length > 0, "real Core thumbnail and preview");
        var sentinel=Path.Combine(temporary,"outside-cache.txt");await File.WriteAllTextAsync(sentinel,"preserve");
        await visuals.ClearAsync();
        Require(!File.Exists(thumbnail)&&!File.Exists(preview),"native cache clear removes generated images");
        Require(File.Exists(png)&&await File.ReadAllTextAsync(sentinel)=="preserve","cache clear preserves source and sibling files");
    }
    Console.WriteLine("passed: authenticated Core, 251 items/3 pages, root scope, write denial, cancellation, unchanged revision, real thumbnail/preview, shutdown");
    await NativeProductProbe.RunAsync(root);
}
finally
{
    SqliteConnection.ClearAllPools();
    Directory.Delete(temporary, true);
}
static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
