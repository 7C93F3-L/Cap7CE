using System.Diagnostics;
using System.Text.Json;

namespace Cap7CE.WinUI.Services;

// Opt-in development evidence: cumulative milliseconds, no paths or search text.
internal sealed class BrowseTiming : IDisposable
{
    private readonly Stopwatch watch=Stopwatch.StartNew();
    private readonly Dictionary<string,double> stages=new();
    private readonly bool enabled=Environment.GetEnvironmentVariable("CAP7CE_BROWSE_TIMING")=="1";
    private static readonly object gate=new();
    private static long sequence,written;
    private readonly long id=Interlocked.Increment(ref sequence);
    public void Mark(string stage){if(enabled)stages[stage]=Math.Round(watch.Elapsed.TotalMilliseconds,2);}
    public void Dispose()
    {
        if(!enabled)return;
        var text=JsonSerializer.Serialize(new{navigation=id,elapsedMs=watch.Elapsed.TotalMilliseconds,stages});
        _=Task.Run(()=>{
            lock(gate) {
                if(id<written)return;
                try{Directory.CreateDirectory(PreferenceStore.DataRoot);File.WriteAllText(Path.Combine(PreferenceStore.DataRoot,"last-browse-timing.json"),text);written=id;}catch{}
            }
        });
    }
}
