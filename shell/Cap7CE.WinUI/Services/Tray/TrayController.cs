using Cap7CE.WinUI.Commands;
using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
namespace Cap7CE.WinUI.Services;
// Owns hide-versus-exit and tray actions; all feature operations reuse existing domain owners.
internal sealed class TrayController : IDisposable
{
    private readonly Window window;
    private readonly ShellServices services;
    private readonly Action settings;
    private readonly Action<UiMessage> report;
    private TrayIcon? icon;
    private TrayMenuHost? menuHost;
    private bool initialized,enabled,exiting,disposed,menuOpen,working;
    public bool RegistrationFailed=>services.Preferences.Current.TrayIconEnabled&&icon?.Registered!=true;
    public TrayController(Window window,ShellServices services,Action settings,Action<UiMessage> report)
    {
        this.window=window;this.services=services;this.settings=settings;this.report=report;
        window.AppWindow.Closing+=Closing;services.Preferences.Changed+=Changed;
    }
    public void Initialize(){initialized=true;Apply();}
    private void Changed()=>window.DispatcherQueue.TryEnqueue(()=>{if(initialized&&!disposed)Apply();});
    private void Apply()
    {
        menuHost?.SetTheme(services.Preferences.Current.Theme);
        var previous=enabled;enabled=services.Preferences.Current.TrayIconEnabled;
        try{
            if(enabled&&icon is null){icon=new(window);icon.Open+=Show;icon.Menu+=OpenMenu;icon.Failure+=Fail;}
            icon?.SetEnabled(enabled);
            if(previous&&!enabled&&!window.AppWindow.IsVisible)Show();
        }catch(Exception error){Fail(error);}
    }
    private void Closing(AppWindow sender,AppWindowClosingEventArgs args)
    {if(TrayPolicy.HideOnClose(enabled,icon?.Registered==true,exiting)){args.Cancel=true;window.AppWindow.Hide();}}
    public void Exit(){if(disposed)return;exiting=true;window.Close();}
    private void Show(){if(!disposed)WindowActivation.Show(window);}
    private void Fail(Exception error){if(disposed)return;NativeDiagnostics.VisualFailure(error);Show();report(UiMessage.Key("ui.tray.failed"));}
    private async void OpenMenu()
    {
        if(menuOpen||disposed)return;menuOpen=true;
        try{
            var state="unknown";
            try{using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(2));state=(await new ModelCommandActions(services).RuntimeAsync("runtime.state",token:timeout.Token)).GetProperty("status").GetString()??state;}catch(Exception error){NativeDiagnostics.VisualFailure(error);}
            if(disposed)return;
            menuHost??=new();
            var action=await menuHost.ShowAsync(services.Preferences.Current.EdgeCollapseEnabled,SystemSettings.LaunchAtLogin,state,working||services.AutoKeywords.Busy,services.Preferences.Current.Theme);
            await ExecuteAsync(action);
        }catch(Exception error){Fail(error);}
        finally{menuOpen=false;}
    }
    private async Task ExecuteAsync(uint action)
    {
        if(disposed||action==0)return;
        switch(action){
            case 1:Show();break;
            case 2:settings();break;
            case 10:case 11:await services.Preferences.UpdateAsync(value=>value with{EdgeCollapseEnabled=action==11});break;
            case 20:case 21:
                if(working)return;working=true;
                try{await new ModelCommandActions(services).ExecuteAsync(action==20?"llama:start":"llama:stop",null);}
                finally{working=false;}break;
            case 30:SystemSettings.LaunchAtLogin=!SystemSettings.LaunchAtLogin;break;
            case 31:Show();report(await NativeUpdates.CheckAsync());break;
            case 40:Exit();break;
        }
    }
    public void Dispose(){if(disposed)return;disposed=true;services.Preferences.Changed-=Changed;window.AppWindow.Closing-=Closing;icon?.Dispose();menuHost?.Dispose();}
}
