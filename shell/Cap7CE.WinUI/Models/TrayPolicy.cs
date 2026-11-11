namespace Cap7CE.WinUI.Models;
internal static class TrayPolicy
{
    public static bool CanStartRuntime(string state,bool busy)=>!busy&&state is "unloaded" or "stopped";
    public static bool CanStopRuntime(string state,bool busy)=>!busy&&state=="running";
    public static bool HideOnClose(bool enabled,bool registered,bool exiting)=>enabled&&registered&&!exiting;
    public static bool ShowOnStartup(bool preference,bool activationRequested,bool registrationFailed)=>preference||activationRequested||registrationFailed;
}
