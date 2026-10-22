namespace Cap7CE.WinUI.Controllers;

// Status refresh only while a visible task is running; never starts or resumes backend work.
internal sealed class VisibleTaskMonitor : IDisposable
{
    private CancellationTokenSource? current;
    public void Start(Func<CancellationToken,Task<bool>> refresh,Action<Exception> failure)
    {Dispose();var own=new CancellationTokenSource();current=own;_ = RunAsync(own,refresh,failure);}
    private static async Task RunAsync(CancellationTokenSource own,Func<CancellationToken,Task<bool>> refresh,Action<Exception> failure)
    {
        try{do{await Task.Delay(1500,own.Token);}while(await refresh(own.Token));}
        catch(OperationCanceledException)when(own.IsCancellationRequested){}
        catch(Exception error){if(!own.IsCancellationRequested)failure(error);}
        finally{own.Dispose();}
    }
    public void Dispose(){try{current?.Cancel();}catch(ObjectDisposedException){}current=null;}
}
