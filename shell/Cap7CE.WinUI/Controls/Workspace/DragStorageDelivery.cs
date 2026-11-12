using System.Diagnostics;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Windows.ApplicationModel.DataTransfer;
namespace Cap7CE.WinUI.Controls;
// One immutable selection per native drag; no paths or filenames enter diagnostics.
internal sealed class DragStorageDelivery
{
    private static long sequence;
    private readonly long id=Interlocked.Increment(ref sequence);
    private readonly AssetItem[] items;
    private readonly DragRequestLifetime lifetime=new();
    private readonly Stopwatch elapsed=Stopwatch.StartNew();
    private int requests;
    public DragStorageDelivery(DataPackage data,IReadOnlyList<AssetItem> selection)
    {
        items=selection.ToArray();
        data.Destroyed+=(_,_)=>lifetime.Dispose();
        data.SetDataProvider(StandardDataFormats.StorageItems,Provide);
        SessionDiagnostics.Record("drag.begin",new{id,count=items.Length});
    }
    public void Complete(DataPackageOperation result)
    {
        lifetime.Complete(result!=DataPackageOperation.None);
        SessionDiagnostics.Record("drag.end",new{id,result=result.ToString(),requests,elapsedMs=Math.Round(elapsed.Elapsed.TotalMilliseconds,2)});
    }
    private async void Provide(DataProviderRequest request)
    {
        DataProviderDeferral? deferral=null;var progress=new FileTransferProgress();var watch=Stopwatch.StartNew();
        var requestId=Interlocked.Increment(ref requests);var outcome="failed";
        SessionDiagnostics.Record("drag.data.begin",new{id,requestId,count=items.Length});
        try {
            deferral=request.GetDeferral();
            var files=await lifetime.ReadAsync(token=>FileCommands.StorageItemsAsync(items,token,progress),request.Deadline).ConfigureAwait(false);
            lifetime.Token.ThrowIfCancellationRequested();
            if(DateTimeOffset.UtcNow>=request.Deadline)throw new TimeoutException("Drag data request deadline expired.");
            request.SetData(files);outcome="delivered";
        }catch(OperationCanceledException){outcome=lifetime.Token.IsCancellationRequested?"canceled":"timeout";}
        catch(TimeoutException){outcome="timeout";}
        catch(Exception error){SessionDiagnostics.Record("drag.data.error",new{id,requestId,type=error.GetType().Name,hresult=$"0x{error.HResult:X8}"});}
        finally {
            try{deferral?.Complete();}catch(Exception error){SessionDiagnostics.Record("drag.data.deferralError",new{id,requestId,type=error.GetType().Name,hresult=$"0x{error.HResult:X8}"});}
            SessionDiagnostics.Record("drag.data.end",new{id,requestId,outcome,stage=progress.Stage,completed=progress.Completed,elapsedMs=Math.Round(watch.Elapsed.TotalMilliseconds,2)});
        }
    }
}
