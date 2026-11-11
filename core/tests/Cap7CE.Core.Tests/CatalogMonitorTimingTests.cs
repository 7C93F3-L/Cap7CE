using System.Text.Json;
using Cap7CE.Core.Host;
using Cap7CE.Core.Host.CatalogMaintenance;
namespace Cap7CE.Core.Tests;
internal static class CatalogMonitorTimingTests
{
    public static async Task RunAsync()
    {
        var rows=new List<(string Name,JsonElement Data)>();double cpu=10;
        var timing=new CatalogMonitorTiming(new((name,data)=>rows.Add((name,JsonSerializer.SerializeToElement(data)))),()=>cpu);
        var value=await timing.RunAsync(CatalogMonitorStage.OwnedIndex,@"C:\private",()=>{cpu=35;return Task.FromResult(7);});
        TestAssert.Equal(7,value,"timing preserves result");
        var row=rows.Last().Data;TestAssert.Equal(25d,row.GetProperty("processCpuMilliseconds").GetDouble(),"process CPU delta measured");
        TestAssert.Equal("C",row.GetProperty("driveLetter").GetString()!,"only drive letter emitted");
        TestAssert.True(!row.ToString().Contains("private"),"no paths in timing");
        await TestAssert.ThrowsAsync<IOException>(()=>timing.RunAsync<int>(CatalogMonitorStage.OwnedRoots,null,()=>throw new IOException("secret-path")),"original failure preserved");
        TestAssert.Equal("failed",rows.Last().Data.GetProperty("outcome").GetString()!,"failed stage identified");
        TestAssert.True(!rows.Last().Data.ToString().Contains("secret"),"no error messages emitted");
        await TestAssert.ThrowsAsync<OperationCanceledException>(()=>timing.RunAsync<int>(CatalogMonitorStage.ReaderConnect,null,()=>Task.FromCanceled<int>(new CancellationToken(true))),"cancellation preserved");
        TestAssert.Equal("cancelled",rows.Last().Data.GetProperty("outcome").GetString()!,"cancellation distinguished");
        var count=rows.Count;
        await timing.RunAsync(CatalogMonitorStage.Retry,null,()=>Task.FromResult(1),true);
        TestAssert.Equal(count,rows.Count,"fast recurring operations stay silent");
        var broken=new CatalogMonitorTiming(new((_,_)=>throw new IOException()),()=>double.NaN);
        TestAssert.Equal(9,await broken.RunAsync(CatalogMonitorStage.VolumeList,null,()=>Task.FromResult(9)),"unavailable diagnostics do not block work");
    }
}
