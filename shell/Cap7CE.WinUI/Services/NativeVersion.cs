using System.Reflection;

namespace Cap7CE.WinUI.Services;

internal static class NativeVersion
{
    public static string Text=>typeof(NativeVersion).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0]??"2.0.6";
}
