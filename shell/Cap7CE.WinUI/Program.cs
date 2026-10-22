using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.Windows.AppLifecycle;
using System.Security.Cryptography;
using System.Text;

namespace Cap7CE.WinUI;

internal static class Program
{
    [STAThread]
    private static async Task Main(string[] args)
    {
        WinRT.ComWrappersSupport.InitializeComWrappers();
        // Explicit fixture catalogs have independent instances and cannot activate the product UI.
        var identity=Environment.GetEnvironmentVariable("CAP7CE_PHASEF_CATALOG")??"product";
        var key="Cap7CE.WinUI."+Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity)))[..16];
        var instance=AppInstance.FindOrRegisterForKey(key);
        if(!instance.IsCurrent){await instance.RedirectActivationToAsync(AppInstance.GetCurrent().GetActivatedEventArgs());return;}
        App? app=null;instance.Activated+=(_,_)=>app?.ActivateMain();
        Application.Start(_=>{
            SynchronizationContext.SetSynchronizationContext(new DispatcherQueueSynchronizationContext(DispatcherQueue.GetForCurrentThread()));
            app=new App();
        });
    }
}
