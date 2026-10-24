using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;

internal sealed class KeywordSelectionService(ShellServices services)
{
    private readonly ManualKeywordService keywords=new(services);
    public async Task<KeywordSelectionSnapshot<AssetItem>> ReadAsync(IReadOnlyList<AssetItem> items,CancellationToken token)
    {
        var files=items.Where(item=>!item.Entry.IsDirectory).ToArray();
        var snapshots=new KeywordFileSnapshot<AssetItem>[files.Length];
        await Parallel.ForEachAsync(Enumerable.Range(0,files.Length),new ParallelOptions{MaxDegreeOfParallelism=4,CancellationToken=token},async(index,cancellation)=>{
            var item=FileAccessGuard.ResolveIdentity(files[index],services.Volumes);
            snapshots[index]=new(item,await keywords.ReadAsync(item,cancellation));
        });
        var unique=snapshots.DistinctBy(file=>$"{file.Item.Entry.VolumeId}:{file.Item.Entry.FileReference}:{file.Item.Entry.CreatedFileTimeMilliseconds}").ToArray();
        return new(KeywordBatchPolicy.Common(unique.Select(file=>file.Value.Words)),unique);
    }
    public Task<KeywordSelectionSaveResult<AssetItem>> SaveAsync(KeywordSelectionSnapshot<AssetItem> original,string[] target,CancellationToken token)
        =>KeywordSelectionWriter.SaveAsync(original,target,keywords.SaveAttemptAsync,token);
}
