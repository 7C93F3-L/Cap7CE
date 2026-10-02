using System.ComponentModel;
using System.Diagnostics;

namespace Cap7CE.Core.Setup;

internal sealed record CapabilitySetupElevatedServerLaunch(
    Process? Server,
    string? FailureReason);

internal static class CapabilitySetupElevatedServerLauncher
{
    private const int ElevationCancelled = 1223;

    public static CapabilitySetupElevatedServerLaunch Start(
        string executablePath,
        string pipeName)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = executablePath,
            UseShellExecute = true,
            Verb = "runas",
            WindowStyle = ProcessWindowStyle.Hidden
        };
        startInfo.ArgumentList.Add("--activation-server");
        startInfo.ArgumentList.Add("--pipe-name");
        startInfo.ArgumentList.Add(pipeName);

        try
        {
            var server = Process.Start(startInfo);
            return server is null
                ? new(null, "activation-elevation-failed")
                : new(server, null);
        }
        catch (Win32Exception error) when (error.NativeErrorCode == ElevationCancelled)
        {
            return new(null, "activation-elevation-cancelled");
        }
        catch (Exception)
        {
            return new(null, "activation-elevation-failed");
        }
    }
}
