using Cap7CE.Core.Protocol;

namespace Cap7CE.WinUI.Services;

// A server-side change wait, not a UI refresh timer. Failure stops until an explicit reconnect.
internal sealed class CatalogChangeSubscription : IDisposable
{
    private readonly CancellationTokenSource stop=new();
    public CatalogChangeSubscription(CoreConnection core,Func<CatalogChangeNotice,Task> changed,Action<Exception> failed,Action<CatalogChangeNotice>? stateChanged=null)
    {
        if(core.Supports(CoreOperations.CatalogAwaitChanges))_ = RunAsync(core,changed,failed,stateChanged);
    }
    private async Task RunAsync(CoreConnection core,Func<CatalogChangeNotice,Task> changed,Action<Exception> failed,Action<CatalogChangeNotice>? stateChanged)
    {
        long sequence=0;var first=true;string? state=null,reason=null;
        try {
            while(!stop.IsCancellationRequested) {
                var operation=core.Supports(CoreOperations.CatalogAwaitScopedChanges)?CoreOperations.CatalogAwaitScopedChanges:CoreOperations.CatalogAwaitChanges;
                var value=await core.RequestAsync<CatalogChangeNotice>(operation,new CatalogAwaitChangesRequest(sequence),stop.Token,30000);
                if(first||value.State!=state||value.Reason!=reason){state=value.State;reason=value.Reason;stateChanged?.Invoke(value);}
                sequence=value.Sequence;if(value.Changed&&!first)await changed(value);first=false;
            }
        } catch(OperationCanceledException)when(stop.IsCancellationRequested){}
        catch(Exception error){if(!stop.IsCancellationRequested)failed(error);}
    }
    public void Dispose()=>stop.Cancel();
}
