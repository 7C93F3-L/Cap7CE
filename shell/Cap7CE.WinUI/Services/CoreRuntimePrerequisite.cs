using Cap7CE.WinUI.Localization;
using System.Diagnostics;
using System.Net.Http;

namespace Cap7CE.WinUI.Services;

internal static class CoreRuntimePrerequisite
{
    public static async Task EnsureAsync(Action<CoreRuntimeProgress>? progress=null)
    {
        var policy=CoreRuntimePolicy.Load();
        using var client=new HttpClient();client.DefaultRequestHeaders.UserAgent.ParseAdd("Cap7CE/CoreCapability");
        var installer=new CoreRuntimeInstaller(policy,policy.IsInstalled,client,RunForegroundAsync,error=>NativeDiagnostics.CoreFailure(error.ToString()));
        var result=await installer.EnsureAsync(progress:progress);
        if(result!=CoreRuntimeResult.Ready)throw new UiFailure(result==CoreRuntimeResult.RestartRequired
            ?"ui.error.runtimeRestartRequired":"ui.error.runtimeInstallFailed");
    }
    private static async Task<int> RunForegroundAsync(string executable,string[] arguments)
    {
        var info=new ProcessStartInfo(executable){UseShellExecute=true};
        foreach(var argument in arguments)info.ArgumentList.Add(argument);
        using var process=Process.Start(info);
        if(process is null)return -1;
        // The user owns the foreground Microsoft installer. Never kill it or restart Windows.
        await process.WaitForExitAsync();return process.ExitCode;
    }
}
