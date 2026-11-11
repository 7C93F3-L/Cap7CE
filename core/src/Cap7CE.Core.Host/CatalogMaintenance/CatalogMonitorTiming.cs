using System.Diagnostics;
namespace Cap7CE.Core.Host.CatalogMaintenance;
public enum CatalogMonitorStage { ReaderConnect, VolumeList, Inspect, OwnedRoots, OwnedIndex, Retry, JournalRead, JournalPublish }
// Stage timing only: no paths, Reader identities, database access or scheduling.
public sealed class CatalogMonitorTiming(CatalogPreparationDiagnostics? diagnostics,Func<double>? cpu=null)
{
    private static double ProcessCpu()
    {
        try{using var process=Process.GetCurrentProcess();return process.TotalProcessorTime.TotalMilliseconds;}
        catch(Exception error)when(error is not OutOfMemoryException){return double.NaN;}
    }
    public async Task<T> RunAsync<T>(CatalogMonitorStage stage,string? display,Func<Task<T>> work,bool slowOnly=false)
    {
        if(diagnostics is null)return await work();
        var driveLetter=display is {Length:>=2}&&char.IsAsciiLetter(display[0])&&display[1]==':'?char.ToUpperInvariant(display[0]).ToString():null;
        var watch=Stopwatch.StartNew();var before=(cpu??ProcessCpu)();var outcome="completed";
        if(!slowOnly)diagnostics?.Write("monitor-stage-started",new{stage=stage.ToString(),driveLetter});
        try{return await work();}
        catch(OperationCanceledException){outcome="cancelled";throw;}
        catch{outcome="failed";throw;}
        finally{
            var delta=(cpu??ProcessCpu)()-before;
            if(!slowOnly||watch.ElapsedMilliseconds>=250||outcome!="completed")diagnostics?.Write("monitor-stage-finished",new{stage=stage.ToString(),driveLetter,outcome,elapsedMilliseconds=Math.Round(watch.Elapsed.TotalMilliseconds,3),
                processCpuMilliseconds=double.IsFinite(delta)&&delta>=0?(double?)Math.Round(delta,3):null});
        }
    }
}
