using System.Runtime.InteropServices;
namespace Cap7CE.WinUI.DesktopActions;
// Short-lived STA work; no permanent discovery thread or background application watcher.
internal static class DesktopShellApartment
{
    private static readonly SemaphoreSlim slots=new(2);
    public static async Task<T> RunAsync<T>(Func<T> read,CancellationToken token=default)
    {
        await slots.WaitAsync(token);
        try {
            var result=new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
            var thread=new Thread(()=>{
                var initialized=CoInitializeEx(0,2);
                try{Marshal.ThrowExceptionForHR(initialized);token.ThrowIfCancellationRequested();result.TrySetResult(read());}
                catch(OperationCanceledException){result.TrySetCanceled(token);}
                catch(Exception error){result.TrySetException(error);}
                finally{if(initialized>=0)CoUninitialize();}
            }){IsBackground=true,Name="Cap7CE application discovery"};
            thread.SetApartmentState(ApartmentState.STA);thread.Start();return await result.Task;
        }finally{slots.Release();}
    }
    public static void Release(object? value){if(value is not null&&Marshal.IsComObject(value))Marshal.FinalReleaseComObject(value);}
    [DllImport("ole32.dll")] private static extern int CoInitializeEx(nint reserved,uint mode);
    [DllImport("ole32.dll")] private static extern void CoUninitialize();
}
