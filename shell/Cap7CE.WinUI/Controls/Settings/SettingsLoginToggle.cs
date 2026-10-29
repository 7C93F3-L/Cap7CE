using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml.Controls;
namespace Cap7CE.WinUI.Controls;
internal static class SettingsLoginToggle
{
    public static ToggleSwitch Create(Action<UiMessage> report)
    {
        var toggle=LanguageUi.Toggle();var syncing=false;var listening=false;
        void Read(){syncing=true;toggle.IsOn=SystemSettings.LaunchAtLogin;syncing=false;}
        void Changed()=>toggle.DispatcherQueue.TryEnqueue(()=>{if(listening)Read();});
        Read();
        toggle.Loaded+=(_,_)=>{if(listening)return;listening=true;SystemSettings.LaunchAtLoginChanged+=Changed;Read();};
        toggle.Unloaded+=(_,_)=>{listening=false;SystemSettings.LaunchAtLoginChanged-=Changed;};
        toggle.Toggled+=(_,_)=>{
            if(syncing)return;
            try{SystemSettings.LaunchAtLogin=toggle.IsOn;}
            catch(Exception error){Read();report(FailureText.From(error));}
        };
        return toggle;
    }
}
