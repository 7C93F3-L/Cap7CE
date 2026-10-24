using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Services;
using System.Diagnostics;
using System.Text.Json;

if(args is not [var root,var directory,var output])throw new ArgumentException("Expected repository root, directory scope and output JSON path");
await NativeBrowseQueryProbe.RunAsync(root,directory,output);

// Explicit read-only query-host probe: no Reader, initialization, metadata or source traversal.
internal static class NativeBrowseQueryProbe
{
    public static async Task RunAsync(string root,string directory,string output)
    {
        var results=new List<object>();var watch=Stopwatch.StartNew();
        using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(40));
        try {
            var database=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Cap7CE/Core/v1/catalog.db");
            await using var core=await CoreConnection.StartAsync(root,database);
            results.Add(new{stage="connection",elapsedMs=watch.Elapsed.TotalMilliseconds});
            watch.Restart();
            var resolved=await core.RequestAsync<CatalogResolveScopeResponse>(CoreOperations.CatalogResolveScope,new CatalogResolveScopeRequest(directory),timeout.Token);
            results.Add(new{stage="scope",elapsedMs=watch.Elapsed.TotalMilliseconds,resolved.Queryable});
            if(!resolved.Queryable||resolved.DirectoryFileReference is null)throw new IOException("scope-not-queryable");
            foreach(var count in new[]{false,true}) {
                watch.Restart();
                var page=await core.RequestAsync<SearchPageResponse>(CoreOperations.SearchStart,
                    new SearchStartRequest("",100,"name-ascending",[resolved.VolumeId!],new("directory-descendants",resolved.VolumeId,resolved.DirectoryFileReference),
                        EntryType:"file",TextTarget:"name-path-or-keywords",ExcludeHidden:true,IncludeTotalCount:count),timeout.Token,deadlineMs:10000);
                results.Add(new{stage="query",includeTotalCount=count,elapsedMs=watch.Elapsed.TotalMilliseconds,loaded=page.Items.Count,page.TotalCount,hasMore=page.NextCursor is not null});
            }
        }catch(Exception error){results.Add(new{stage="error",error=error.Message,elapsedMs=watch.Elapsed.TotalMilliseconds});}
        await File.WriteAllTextAsync(output,JsonSerializer.Serialize(results,new JsonSerializerOptions{WriteIndented=true}));
    }
}
