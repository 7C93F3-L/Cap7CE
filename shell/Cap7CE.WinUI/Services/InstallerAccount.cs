using System.Runtime.InteropServices;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;

namespace Cap7CE.WinUI.Services;

internal static class InstallerAccount
{
    // Do not attribute a user's search capability to alternate UAC credentials.
    public static bool MatchesDesktop()
    {
        var shell=GetShellWindow();if(shell==IntPtr.Zero)return false;
        GetWindowThreadProcessId(shell,out var pid);
        using var process=OpenProcess(0x1000,false,pid);
        if(process.IsInvalid||!OpenProcessToken(process,8,out var token))return false;
        using(token)
        using(var desktop=new WindowsIdentity(token.DangerousGetHandle()))
        using(var current=WindowsIdentity.GetCurrent())return current.User==desktop.User;
    }
    [DllImport("user32.dll")]private static extern IntPtr GetShellWindow();
    [DllImport("user32.dll")]private static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
    [DllImport("kernel32.dll",SetLastError=true)]private static extern SafeProcessHandle OpenProcess(uint access,bool inherit,uint pid);
    [DllImport("advapi32.dll",SetLastError=true)]
    [return:MarshalAs(UnmanagedType.Bool)]private static extern bool OpenProcessToken(SafeProcessHandle process,uint access,out SafeAccessTokenHandle token);
}
