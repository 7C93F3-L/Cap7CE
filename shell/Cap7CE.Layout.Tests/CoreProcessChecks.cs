using System.Diagnostics;
using Cap7CE.WinUI.Services;

internal static class CoreProcessChecks
{
    public static async Task RunAsync()
    {
        var directory=Path.Combine(Path.GetTempPath(),"Cap7CE-core-diagnostics-"+Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try {
        var journal=new DiagnosticJournal(directory);
        var info=new ProcessStartInfo(Environment.ProcessPath!){UseShellExecute=false,CreateNoWindow=true,RedirectStandardError=true,RedirectStandardInput=true};
        info.ArgumentList.Add("--core-exit-fixture");
        using(var child=Process.Start(info)!) {
            string? report=null;var diagnostics=new CoreProcessDiagnostics(child,value=>report=value,(name,data)=>journal.Write(name,data));
            await child.StandardInput.WriteLineAsync("exit");
            await diagnostics.Completion.WaitAsync(TimeSpan.FromSeconds(5));
            if(report is null||!report.Contains("Exit code: 7")||!report.Contains("controlled-core-failure"))throw new Exception("Unexpected exit must preserve exit code and drained stderr");
        }
        using(var child=Process.Start(info)!) {
            var reported=false;var diagnostics=new CoreProcessDiagnostics(child,_=>reported=true,(name,data)=>journal.Write(name,data));diagnostics.ExpectExit();
            await child.StandardInput.WriteLineAsync("exit");
            await diagnostics.Completion.WaitAsync(TimeSpan.FromSeconds(5));
            if(reported)throw new Exception("Expected shutdown must not report a failure");
        }
        var events=File.ReadAllLines(Path.Combine(directory,DiagnosticJournal.Names[0])).Select(line=>System.Text.Json.JsonDocument.Parse(line)).ToArray();
        try {
            if(events.Count(e=>e.RootElement.GetProperty("name").GetString()=="core.catalog")!=2)throw new Exception("Catalog preparation events must be persisted immediately for both expected and unexpected exits, before the stderr ring evicts them");
            if(events.Any(e=>!e.RootElement.GetProperty("detail").GetProperty("data").GetString()!.Contains("preparation-cancelled")))throw new Exception("Only structured Catalog diagnostics belong in the preparation journal");
        }finally{foreach(var entry in events)entry.Dispose();}
        Console.WriteLine("Core process checks passed: unexpected exit, expected shutdown suppression and immediate bounded Catalog diagnostic persistence.");
        }finally{Directory.Delete(directory,true);}
    }
}
