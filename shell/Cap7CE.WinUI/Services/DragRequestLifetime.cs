namespace Cap7CE.WinUI.Services;
// Successful drops may still retrieve data. Only cancellation, destruction or a request deadline stops delivery.
internal sealed class DragRequestLifetime : IDisposable
{
    private readonly CancellationTokenSource canceled=new();
    private readonly TimeSpan maximum;
    private int disposed;
    public CancellationToken Token {get;}
    public DragRequestLifetime(TimeSpan? maximum=null)
    {Token=canceled.Token;this.maximum=maximum??TimeSpan.FromSeconds(10);}
    public async Task<T> ReadAsync<T>(Func<CancellationToken,Task<T>> read,DateTimeOffset deadline)
    {
        Token.ThrowIfCancellationRequested();
        var remaining=deadline-DateTimeOffset.UtcNow-TimeSpan.FromMilliseconds(50);
        if(remaining<=TimeSpan.Zero)throw new TimeoutException("Drag data request deadline expired.");
        using var request=CancellationTokenSource.CreateLinkedTokenSource(Token);
        request.CancelAfter(remaining<maximum?remaining:maximum);
        var pending=read(request.Token);
        try{return await pending.WaitAsync(request.Token).ConfigureAwait(false);}
        finally{if(!pending.IsCompleted)_=pending.ContinueWith(task=>{_=task.Exception;},CancellationToken.None,TaskContinuationOptions.OnlyOnFaulted|TaskContinuationOptions.ExecuteSynchronously,TaskScheduler.Default);}
    }
    public void Complete(bool accepted){if(!accepted)Dispose();}
    public void Dispose(){if(Interlocked.Exchange(ref disposed,1)!=0)return;canceled.Cancel();canceled.Dispose();}
}
