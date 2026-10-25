using System.Diagnostics;
using Cap7CE.WinUI.Services;

internal static class CoreProcessChecks
{
    public static async Task RunAsync()
    {
        var info=new ProcessStartInfo(Environment.ProcessPath!){UseShellExecute=false,CreateNoWindow=true,RedirectStandardError=true,RedirectStandardInput=true};
        info.ArgumentList.Add("--core-exit-fixture");
        using(var child=Process.Start(info)!) {
            string? report=null;var diagnostics=new CoreProcessDiagnostics(child,value=>report=value);
            await child.StandardInput.WriteLineAsync("exit");
            await diagnostics.Completion.WaitAsync(TimeSpan.FromSeconds(5));
            if(report is null||!report.Contains("Exit code: 7")||!report.Contains("controlled-core-failure"))throw new Exception("Unexpected exit must preserve exit code and drained stderr");
        }
        using(var child=Process.Start(info)!) {
            var reported=false;var diagnostics=new CoreProcessDiagnostics(child,_=>reported=true);diagnostics.ExpectExit();
            await child.StandardInput.WriteLineAsync("exit");
            await diagnostics.Completion.WaitAsync(TimeSpan.FromSeconds(5));
            if(reported)throw new Exception("Expected shutdown must not report a failure");
        }
        Console.WriteLine("Core process checks passed: unexpected exit code/stderr and expected shutdown suppression.");
    }
}
