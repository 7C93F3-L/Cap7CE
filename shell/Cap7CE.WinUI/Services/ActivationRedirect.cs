using System.Runtime.InteropServices;
using Microsoft.Windows.AppLifecycle;

namespace Cap7CE.WinUI.Services;

internal static class ActivationRedirect
{
    // Keep the real UI entry synchronous STA. Only the secondary instance waits here;
    // COM/window messages must keep flowing while activation is redirected.
    public static void Run(AppInstance instance,AppActivationArguments arguments)
    {
        var completed=new ManualResetEvent(false);
        var work=Task.Run(async()=>{try{await instance.RedirectActivationToAsync(arguments);}finally{completed.Set();}});
        try {
            var result=CoWaitForMultipleHandles(0x18,10000,1,[completed.SafeWaitHandle.DangerousGetHandle()],out _);
            Marshal.ThrowExceptionForHR(result);work.GetAwaiter().GetResult();
        }
        finally {
            if(work.IsCompleted)completed.Dispose();
            else _=work.ContinueWith(task=>{_=task.Exception;completed.Dispose();},TaskScheduler.Default);
        }
    }
    [DllImport("ole32.dll")]
    private static extern int CoWaitForMultipleHandles(uint flags,uint timeout,uint count,nint[] handles,out uint index);
}
