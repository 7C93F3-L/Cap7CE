using Cap7CE.WinUI.Localization;
using Microsoft.Win32;

namespace Cap7CE.WinUI.Services;

internal static class SystemSettings
{
    public static event Action? LaunchAtLoginChanged;
    private const string RunKey=@"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string Name="Cap7CE.WinUI";
    private static string Command=>"\""+(Environment.ProcessPath??throw new UiFailure("ui.error.programPath"))+"\"";
    public static bool LaunchAtLogin
    {
        get{using var key=Registry.CurrentUser.OpenSubKey(RunKey);return string.Equals(key?.GetValue(Name) as string,Command,StringComparison.OrdinalIgnoreCase);}
        set{using var key=Registry.CurrentUser.CreateSubKey(RunKey,true);if(value)key.SetValue(Name,Command);else key.DeleteValue(Name,false);LaunchAtLoginChanged?.Invoke();}
    }
}
