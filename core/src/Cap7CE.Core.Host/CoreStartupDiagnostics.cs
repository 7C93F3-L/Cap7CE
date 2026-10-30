using System.Diagnostics;
using System.Text.Json;

namespace Cap7CE.Core.Host;

// Fixed stage names and timings only. A stage starts before work so a killed
// startup still identifies the unfinished operation in the shell journal.
internal sealed class CoreStartupDiagnostics
{
    private readonly Stopwatch watch = Stopwatch.StartNew();
    private double previous;
    private string? stage;
    public void Mark(string next)
    {
        try {
            var elapsed = watch.Elapsed.TotalMilliseconds;
            Console.Error.WriteLine(JsonSerializer.Serialize(new {
                type = "core-startup-v1", pid = Environment.ProcessId, stage = next,
                previousStage = stage, previousStageMs = Math.Round(elapsed - previous, 2),
                elapsedMs = Math.Round(elapsed, 2)
            }));
            previous = elapsed; stage = next;
        } catch { /* Timing must never prevent startup. */ }
    }
}
