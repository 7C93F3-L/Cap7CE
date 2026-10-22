using Cap7CE.Core.Protocol;

namespace Cap7CE.WinUI.Services;

// A server-side change wait, not a UI refresh timer. Failure stops until an explicit reconnect.
internal sealed class CatalogChangeSubscription : IDisposable
{
    private readonly CancellationTokenSource stop=new();
    public CatalogChangeSubscription(CoreConnection core,Action changed,Action<Exception> failed)
    {
        if(core.Supports(CoreOperations.CatalogAwaitChanges))_ = RunAsync(core,changed,failed);
    }
    private async Task RunAsync(CoreConnection core,Action changed,Action<Exception> failed)
    {
        long sequence=0;var first=true;
        try {
            while(!stop.IsCancellationRequested) {
                var value=await core.RequestAsync<CatalogChangeNotice>(CoreOperations.CatalogAwaitChanges,new CatalogAwaitChangesRequest(sequence),stop.Token,30000);
                sequence=value.Sequence;if(value.Changed&&!first)changed();first=false;
            }
        } catch(OperationCanceledException)when(stop.IsCancellationRequested){}
        catch(Exception error){if(!stop.IsCancellationRequested)failed(error);}
    }
    public void Dispose()=>stop.Cancel();
}
