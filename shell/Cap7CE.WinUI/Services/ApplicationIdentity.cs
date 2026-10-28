using System.Runtime.InteropServices;

namespace Cap7CE.WinUI.Services;

internal static class ApplicationIdentity
{
    public const string Name="Cap7CE";
    public const string AppUserModelId="Cap7CE";
    public static void Initialize()=>Marshal.ThrowExceptionForHR(SetCurrentProcessExplicitAppUserModelID(AppUserModelId));
    [DllImport("shell32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]
    private static extern int SetCurrentProcessExplicitAppUserModelID(string appId);
}
