namespace Cap7CE.WinUI.Services;
internal sealed class FileTransferProgress
{
    public volatile string Stage="queued";
    public volatile int Completed;
}
// Bound native filesystem work independently of a caller that has stopped waiting.
internal static class FileTransferRead
{
    private static readonly SemaphoreSlim slots=new(2);
    public static Task<IReadOnlyList<TResult>> RunAsync<T,TResult>(IReadOnlyList<T> items,Action<T> validate,
        Func<T,CancellationToken,Task<TResult>> resolve,CancellationToken token,FileTransferProgress? progress=null)
    {
        var snapshot=items.ToArray();
        return Task.Run(async()=>{
            await slots.WaitAsync(token).ConfigureAwait(false);
            try {
                var result=new List<TResult>();
                foreach(var item in snapshot){
                    token.ThrowIfCancellationRequested();if(progress is not null)progress.Stage="validating";
                    validate(item);token.ThrowIfCancellationRequested();if(progress is not null)progress.Stage="resolving";
                    var value=await resolve(item,token).ConfigureAwait(false);token.ThrowIfCancellationRequested();result.Add(value);
                    if(progress is not null)progress.Completed=result.Count;
                }
                if(progress is not null)progress.Stage="ready";
                return (IReadOnlyList<TResult>)result;
            }finally{slots.Release();}
        },token);
    }
}
