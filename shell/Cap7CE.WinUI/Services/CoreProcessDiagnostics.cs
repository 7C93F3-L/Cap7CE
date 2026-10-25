using System.Diagnostics;

namespace Cap7CE.WinUI.Services;

internal sealed class CoreProcessDiagnostics
{
    private readonly Queue<string> errors=new();
    private readonly object gate=new();
    private int expected;
    public string Errors {get{lock(gate)return string.Join(Environment.NewLine,errors);}}
    public Task Completion {get;}
    public CoreProcessDiagnostics(Process process,Action<string> report)
    {
        process.ErrorDataReceived+=(_,e)=>{if(e.Data is {} line)lock(gate){errors.Enqueue(line[..Math.Min(line.Length,512)]);while(errors.Count>24)errors.Dequeue();}};
        process.BeginErrorReadLine();Completion=ObserveAsync(process,report);
    }
    public void ExpectExit()=>Interlocked.Exchange(ref expected,1);
    private async Task ObserveAsync(Process process,Action<string> report)
    {
        try {
            await process.WaitForExitAsync().ConfigureAwait(false);
            if(Volatile.Read(ref expected)==0)report($"{DateTimeOffset.Now:O}\nCore PID: {process.Id}\nExit code: {process.ExitCode} (0x{process.ExitCode:X8})\n{Errors}");
        }catch(Exception error){if(Volatile.Read(ref expected)==0)try{report("Core exit diagnostics failed: "+error.Message);}catch{}}
    }
}
