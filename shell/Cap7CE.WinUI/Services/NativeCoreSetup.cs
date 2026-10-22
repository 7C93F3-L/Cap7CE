using System.Diagnostics;
using System.Text.Json;

namespace Cap7CE.WinUI.Services;

internal static class NativeCoreSetup
{
    public static string Executable(string root)=>Path.Combine(root,"core/artifacts/product-capability/v1/bundle/Cap7CE.Core.Setup.exe");
    public static async Task RunAsync(string root,bool repair)
    {
        var executable=Executable(root);if(!File.Exists(executable))throw new IOException("Core安装组件缺失，请重新构建或重新解压完整WinUI程序包。");
        var info=new ProcessStartInfo(executable){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
        foreach(var arg in new[]{"--activation-coordinator","--action",repair?"repair":"enable","--catalog","preserve"})info.ArgumentList.Add(arg);
        using var process=Process.Start(info)??throw new IOException("无法启动Core配置工具。");
        var output=process.StandardOutput.ReadToEndAsync();var error=process.StandardError.ReadToEndAsync();
        // The existing coordinator owns UAC, authentication, its five-minute deadline and transaction recovery.
        await process.WaitForExitAsync();var text=await output;var details=await error;
        if(process.ExitCode!=0) {
            NativeDiagnostics.CoreFailure(text+"\n"+details);
            var reason="Core配置未完成，可能取消了UAC或缺少.NET 10 x64运行时。";
            foreach(var line in text.Split('\n').Reverse())try{using var json=JsonDocument.Parse(line);if(json.RootElement.TryGetProperty("reason",out var value)){reason+="\n"+value.GetString();break;}}catch(JsonException){}
            throw new IOException(reason);
        }
    }
}
