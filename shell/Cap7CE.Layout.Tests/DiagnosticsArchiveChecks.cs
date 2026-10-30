using System.IO.Compression;
using System.Text.Json;
using Cap7CE.WinUI.Services;

internal static class DiagnosticsArchiveChecks
{
    public static async Task RunAsync()
    {
        var root=Path.Combine(Path.GetTempPath(),"cap7ce-diagnostics-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
        var large=Path.Combine(root,"last-core-error.log");var locked=Path.Combine(root,"last-visual-error.log");
        try {
            foreach(var name in DiagnosticJournal.Names)await File.WriteAllTextAsync(Path.Combine(root,name),"{\"name\":\"session.start\"}\n");
            await File.WriteAllBytesAsync(large,Enumerable.Repeat((byte)90,1024*1024+17).ToArray());
            await using var held=new FileStream(locked,FileMode.Create,FileAccess.Write,FileShare.None);
            using var buffer=new MemoryStream();await DiagnosticsArchive.WriteAsync(buffer,root,new{coreConnected=true});buffer.Position=0;
            using var zip=new ZipArchive(buffer,ZipArchiveMode.Read);
            if(DiagnosticJournal.Names.Any(name=>zip.GetEntry(name) is null))throw new Exception("Retained session traces missing from export.");
            if(zip.GetEntry("last-core-error.log")?.Length!=1024*1024||zip.GetEntry("last-visual-error.log") is not null)throw new Exception("Bounded log collection failed.");
            using var report=await JsonDocument.ParseAsync(zip.GetEntry("collection.json")!.Open());
            var rows=report.RootElement.EnumerateArray().ToArray();
            if(!rows.Any(row=>row.GetProperty("status").GetString()=="missing")||!rows.Any(row=>row.GetProperty("status").GetString()=="unavailable")||!rows.Any(row=>row.TryGetProperty("truncated",out var value)&&value.GetBoolean()))throw new Exception("Collection status manifest incomplete.");
            using var runtime=await JsonDocument.ParseAsync(zip.GetEntry("runtime.json")!.Open());
            if(!runtime.RootElement.GetProperty("coreConnected").GetBoolean())throw new Exception("Runtime snapshot lost.");
            Console.WriteLine("Diagnostics archive passed: bounded copy, missing/locked logs, truncation report and snapshot roundtrip.");
        }finally{foreach(var file in Directory.EnumerateFiles(root))File.Delete(file);Directory.Delete(root);}
    }
}
