using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.Windows.AppLifecycle;
using System.Security.Cryptography;
using System.Text;

namespace Cap7CE.WinUI;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if(Thread.CurrentThread.GetApartmentState()!=ApartmentState.STA)throw new InvalidOperationException("WinUI requires an STA entry thread.");
        Services.ApplicationIdentity.Initialize();
        WinRT.ComWrappersSupport.InitializeComWrappers();
        // Explicit fixture catalogs have independent instances and cannot activate the product UI.
        var identity=Environment.GetEnvironmentVariable("CAP7CE_PHASEF_CATALOG")??"product";
        var key="Cap7CE.WinUI."+Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity)))[..16];
        var instance=AppInstance.FindOrRegisterForKey(key);
        if(!instance.IsCurrent){Services.ActivationRedirect.Run(instance,AppInstance.GetCurrent().GetActivatedEventArgs());return;}
        Services.SessionDiagnostics.Start(Services.PreferenceStore.DataRoot);
        App? app=null;var activationGate=new object();var activationPending=false;
        instance.Activated+=(_,_)=>{lock(activationGate){if(app is null)activationPending=true;else app.ActivateMain();}};
        Application.Start(_=>{
            SynchronizationContext.SetSynchronizationContext(new DispatcherQueueSynchronizationContext(DispatcherQueue.GetForCurrentThread()));
            var created=new App();lock(activationGate){app=created;if(activationPending)app.ActivateMain();}
        });
    }
}
