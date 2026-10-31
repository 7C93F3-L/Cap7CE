using System.Diagnostics;

namespace Cap7CE.WinUI.Services;

internal sealed class CoreProcessDiagnostics
{
    private readonly Queue<string> errors=new();
    private readonly object gate=new();
    private int expected;
    public string Errors {get{lock(gate)return string.Join(Environment.NewLine,errors);}}
    public Task Completion {get;}
    public CoreProcessDiagnostics(Process process,Action<string> report,Action<string,object?>? record=null)
    {
        record??=SessionDiagnostics.Record;
        process.ErrorDataReceived+=(_,e)=>{if(e.Data is {} line){
            if(line.StartsWith("{\"type\":\"core-startup-v1\",",StringComparison.Ordinal)&&line.Length<=1024)
                record("core.startup",new{pid=process.Id,data=line});
            if(line.StartsWith("{\"type\":\"catalog-diagnostic-v1\",",StringComparison.Ordinal)&&line.Length<=2048)
                record("core.catalog",new{pid=process.Id,data=line});
            lock(gate){errors.Enqueue(line[..Math.Min(line.Length,512)]);while(errors.Count>24)errors.Dequeue();}}};
        process.BeginErrorReadLine();Completion=ObserveAsync(process,report);
    }
    public void ExpectExit()=>Interlocked.Exchange(ref expected,1);
    private async Task ObserveAsync(Process process,Action<string> report)
    {
        try {
            await process.WaitForExitAsync().ConfigureAwait(false);
            SessionDiagnostics.Record("core.exit",new{pid=process.Id,process.ExitCode,expected=Volatile.Read(ref expected)!=0});
            if(Volatile.Read(ref expected)==0)report($"{DateTimeOffset.Now:O}\nCore PID: {process.Id}\nExit code: {process.ExitCode} (0x{process.ExitCode:X8})\n{Errors}");
        }catch(Exception error){if(Volatile.Read(ref expected)==0)try{report("Core exit diagnostics failed: "+error.Message);}catch{}}
    }
}
