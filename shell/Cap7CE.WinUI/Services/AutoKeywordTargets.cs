using Cap7CE.WinUI.Localization;
using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;

internal static class AutoKeywordTargets
{
    public static async Task<(IReadOnlyList<AssetItem> Items,int Failed)> CollectAsync(ShellServices services,IReadOnlyList<AssetItem> source,CancellationToken token,Action<int> discovered)
    {
        var targets=new Dictionary<string,AssetItem>(StringComparer.OrdinalIgnoreCase);var failed=0;
        void Add(AssetItem item){var key=item.Entry.FileReference is null?item.FullPath:$"{item.Entry.VolumeId}:{item.Entry.FileReference}:{item.Entry.CreatedFileTimeMilliseconds}";targets.TryAdd(key,item);if(targets.Count>100000)throw new UiFailure("ui.error.autoScope");}
        foreach(var item in source)if(!item.Entry.IsDirectory) {
            token.ThrowIfCancellationRequested();
            try{Add(FormatRegistry.Find(item.Entry.Extension)?.CanAIIndex==true?FileAccessGuard.ResolveIdentity(item,services.Volumes):item);}
            catch{failed++;}
            if((targets.Count+failed)%100==0)await Task.Yield();
        }
        var core=services.Core??throw new UiFailure("ui.error.coreRetry");
        foreach(var root in source.Where(item=>item.Entry.IsDirectory).DistinctBy(item=>item.FullPath,StringComparer.OrdinalIgnoreCase)) {
            token.ThrowIfCancellationRequested();
            try {
                var directory=FileAccessGuard.ResolveIdentity(root,services.Volumes);
                var resolved=await core.RequestAsync<CatalogResolveScopeResponse>(CoreOperations.CatalogResolveScope,new CatalogResolveScopeRequest(root.FullPath),token);
                if(!resolved.Queryable||resolved.VolumeId is null||resolved.DirectoryFileReference is null)throw new UiFailure("ui.error.autoIndex");
                var page=await core.RequestAsync<SearchPageResponse>(CoreOperations.SearchStart,
                    new SearchStartRequest("",100,"name-ascending",[resolved.VolumeId],new("directory-descendants",resolved.VolumeId,resolved.DirectoryFileReference),EntryType:"file",
                        Continuation:core.Supports(CoreOperations.SearchLive)?"live":null),token);
                for(;;) {
                    FileAccessGuard.Validate(directory);
                    foreach(var entry in page.Items) {
                        token.ThrowIfCancellationRequested();
                        var volume=services.Volumes.First(value=>value.VolumeId==entry.VolumeId);
                        var path=Path.GetFullPath(Path.Combine(volume.DisplayName.TrimEnd('\\')+"\\",entry.RelativePath.TrimStart('\\','/')));
                        if(!path.StartsWith(root.FullPath.TrimEnd('\\')+"\\",StringComparison.OrdinalIgnoreCase))throw new UiFailure("ui.error.autoPath");
                        Add(new(entry,path));
                    }
                    discovered(targets.Count);
                    if(page.NextCursor is null)break;
                    page=await core.RequestAsync<SearchPageResponse>(CoreOperations.SearchNextPage,new SearchNextPageRequest(page.NextCursor),token);
                }
            }catch(OperationCanceledException){throw;}
            catch(Exception error){if(targets.Count>100000)throw;failed++;System.Diagnostics.Debug.WriteLine(error);}
        }
        return (targets.Values.ToArray(),failed);
    }
}
