using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;

internal static class AutoKeywordTargets
{
    public static async Task<(IReadOnlyList<AssetItem> Items,int Failed)> CollectAsync(ShellServices services,IReadOnlyList<AssetItem> source,CancellationToken token,Action<int> discovered)
    {
        var targets=new Dictionary<string,AssetItem>(StringComparer.OrdinalIgnoreCase);var failed=0;
        void Add(AssetItem item){var key=item.Entry.FileReference is null?item.FullPath:$"{item.Entry.VolumeId}:{item.Entry.FileReference}:{item.Entry.CreatedFileTimeMilliseconds}";targets.TryAdd(key,item);if(targets.Count>100000)throw new IOException("范围超过十万个文件，请选择更小的目录。");}
        foreach(var item in source)if(!item.Entry.IsDirectory) {
            token.ThrowIfCancellationRequested();
            try{Add(FormatRegistry.Find(item.Entry.Extension)?.CanAIIndex==true?FileAccessGuard.ResolveIdentity(item,services.Volumes):item);}
            catch{failed++;}
            if((targets.Count+failed)%100==0)await Task.Yield();
        }
        var core=services.Core??throw new IOException("Core 尚未连接，请稍后重试。");
        foreach(var root in source.Where(item=>item.Entry.IsDirectory).DistinctBy(item=>item.FullPath,StringComparer.OrdinalIgnoreCase)) {
            token.ThrowIfCancellationRequested();
            try {
                var directory=FileAccessGuard.ResolveIdentity(root,services.Volumes);
                var resolved=await core.RequestAsync<CatalogResolveScopeResponse>(CoreOperations.CatalogResolveScope,new CatalogResolveScopeRequest(root.FullPath),token);
                if(!resolved.Queryable||resolved.VolumeId is null||resolved.DirectoryFileReference is null)throw new IOException("目录尚未入库，请先建立目录索引。");
                var page=await core.RequestAsync<SearchPageResponse>(CoreOperations.SearchStart,
                    new SearchStartRequest("",100,"name-ascending",[resolved.VolumeId],new("directory-descendants",resolved.VolumeId,resolved.DirectoryFileReference),EntryType:"file",
                        Continuation:core.Supports(CoreOperations.SearchLive)?"live":null),token);
                for(;;) {
                    FileAccessGuard.Validate(directory);
                    foreach(var entry in page.Items) {
                        token.ThrowIfCancellationRequested();
                        var volume=services.Volumes.First(value=>value.VolumeId==entry.VolumeId);
                        var path=Path.GetFullPath(Path.Combine(volume.DisplayName.TrimEnd('\\')+"\\",entry.RelativePath.TrimStart('\\','/')));
                        if(!path.StartsWith(root.FullPath.TrimEnd('\\')+"\\",StringComparison.OrdinalIgnoreCase))throw new IOException("目录结果越界");
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
