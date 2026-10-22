using Microsoft.Win32;

namespace Cap7CE.WinUI.Services;

internal static class SystemSettings
{
    private const string RunKey=@"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string Name="Cap7CE.WinUI";
    private static string Command=>"\""+(Environment.ProcessPath??throw new IOException("程序路径不可用"))+"\"";
    public static bool LaunchAtLogin
    {
        get{using var key=Registry.CurrentUser.OpenSubKey(RunKey);return string.Equals(key?.GetValue(Name) as string,Command,StringComparison.OrdinalIgnoreCase);}
        set{using var key=Registry.CurrentUser.CreateSubKey(RunKey,true);if(value)key.SetValue(Name,Command);else key.DeleteValue(Name,false);}
    }
}
