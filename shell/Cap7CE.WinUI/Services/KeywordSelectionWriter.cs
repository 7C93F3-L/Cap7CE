using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;

internal static class KeywordSelectionWriter
{
    public static async Task<KeywordSelectionSaveResult<T>> SaveAsync<T>(KeywordSelectionSnapshot<T> original,string[] target,
        Func<T,string[],string?,Task<ManualKeywordSaveResult>> write,CancellationToken token)
    {
        var results=new KeywordFileSnapshot<T>[original.Files.Count];var succeeded=0;
        await Parallel.ForEachAsync(Enumerable.Range(0,original.Files.Count),new ParallelOptions{MaxDegreeOfParallelism=4,CancellationToken=token},async(index,cancellation)=>{
            var file=original.Files[index];results[index]=file;
            try {
                var current=file.Value;
                for(var attempt=0;attempt<3;attempt++) {
                    cancellation.ThrowIfCancellationRequested();
                    var words=original.Files.Count==1?target:KeywordBatchPolicy.Apply(current.Words,original.Words,target);
                    var saved=await write(file.Item,words,current.Revision);
                    if(saved.Saved){results[index]=new(file.Item,saved.Current);Interlocked.Increment(ref succeeded);return;}
                    if(original.Files.Count==1)return;
                    current=saved.Current;
                }
            }catch(OperationCanceledException)when(cancellation.IsCancellationRequested){throw;}
            catch(Exception){/* Keep successful writes and leave the caller's draft intact. */}
        });
        return new(new(KeywordBatchPolicy.Common(results.Select(file=>file.Value.Words)),results),succeeded,results.Length-succeeded);
    }
}
