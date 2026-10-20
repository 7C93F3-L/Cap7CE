using Microsoft.UI.Xaml;

namespace Cap7CE.WinUI;
public partial class App : Application
{
    private MainWindow? window;
    public App()
    {
        UnhandledException += (_, e) => LogFailure(e.Exception);
        try { InitializeComponent(); } catch (Exception error) { LogFailure(error); throw; }
    }
    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        try { window = new MainWindow(); window.Activate(); }
        catch (Exception error) { LogFailure(error); throw; }
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
