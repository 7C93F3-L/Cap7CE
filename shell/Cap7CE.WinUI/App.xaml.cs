using Microsoft.UI.Xaml;

namespace Cap7CE.WinUI;
public partial class App : Application
{
    private readonly Microsoft.UI.Dispatching.DispatcherQueue queue=Microsoft.UI.Dispatching.DispatcherQueue.GetForCurrentThread();
    private MainWindow? window;
    private bool initializing=true,activationRequested;
    internal void ActivateMain()=>queue.TryEnqueue(()=>{
        if(initializing){activationRequested=true;return;}
        if(window is {} target)Services.WindowActivation.Show(target);
    });
    public App()
    {
        UnhandledException += (_, e) => { Services.SessionDiagnostics.Record("exception.xaml",new{e.Message,error=Services.SessionDiagnostics.Error(e.Exception)});LogFailure(e.Exception); };
        try { InitializeComponent(); } catch (Exception error) { LogFailure(error); throw; }
    }
    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        using var trace=Services.SessionDiagnostics.Begin("app.launch");
        try {
            var target=window=new MainWindow();target.Closed+=(_,_)=>{if(ReferenceEquals(window,target))window=null;};
            await target.LoadStartupAsync();trace.Mark("preferences-and-tray-ready");if(!ReferenceEquals(window,target))return;
            initializing=false;
            if(Models.TrayPolicy.ShowOnStartup(target.ShowMainOnStartup,activationRequested,target.TrayRegistrationFailed))Services.WindowActivation.Show(target);
            trace.Mark("window-initialized");await target.StartServicesAsync();trace.Mark("startup-services-returned");
        }
        catch (Exception error) { trace.Fail(error);LogFailure(error); throw; }
    }
    private static void LogFailure(Exception error)
    {
        try
        {
            var directory = Services.PreferenceStore.DataRoot;
            Directory.CreateDirectory(directory);
            File.WriteAllText(Path.Combine(directory, "last-startup-error.log"), error.ToString());
        }
        catch { }
    }
}
