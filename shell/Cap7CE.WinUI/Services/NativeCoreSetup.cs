using Cap7CE.WinUI.Localization;
using System.Diagnostics;
using System.Text.Json;

namespace Cap7CE.WinUI.Services;

internal static class NativeCoreSetup
{
    public static string Executable(string root)=>Path.Combine(root,"core/artifacts/product-capability/v1/bundle/Cap7CE.Core.Setup.exe");
    public static async Task RunAsync(string root,bool repair,Func<Task>? beforeSetup=null,Action<CoreRuntimeProgress>? progress=null)
    {
        var executable=Executable(root);if(!File.Exists(executable))throw new UiFailure("ui.error.setupMissing");
        var volumes=CoreSetupVolumes.Read();if(volumes.Length==0)throw new UiFailure("ui.error.setupNoVolumes");
        await CoreRuntimePrerequisite.EnsureAsync(progress);
        if(beforeSetup is not null)await beforeSetup();
        progress?.Invoke(new(CoreRuntimeStage.Configuring));
        var info=new ProcessStartInfo(executable){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
        foreach(var arg in CoreSetupVolumes.Arguments(repair,volumes))info.ArgumentList.Add(arg);
        using var process=Process.Start(info)??throw new UiFailure("ui.error.setupStart");
        var output=process.StandardOutput.ReadToEndAsync();var error=process.StandardError.ReadToEndAsync();
        // The existing coordinator owns UAC, authentication, its five-minute deadline and transaction recovery.
        await process.WaitForExitAsync();var text=await output;var details=await error;
        if(process.ExitCode!=0) {
            NativeDiagnostics.CoreFailure(text+"\n"+details);
            var reason="";
            foreach(var line in text.Split('\n').Reverse())try{using var json=JsonDocument.Parse(line);if(json.RootElement.TryGetProperty("reason",out var value)){reason="\n"+value.GetString();break;}}catch(JsonException){}
            throw new UiFailure("ui.error.setupFailed",inner:new IOException(reason));
        }
    }
}
