using System.IO.Compression;
using System.Text.Json;

namespace Cap7CE.WinUI.Services;
internal static class DiagnosticsArchive
{
    public static readonly string[] LogNames=["catalog-health.json","last-startup-error.log","last-core-error.log","last-core-runtime-error.log","last-titlebar-region-error.log","last-visual-error.log","last-browse-timing.json"];
    public static async Task WriteAsync(Stream output,string directory,object snapshot)
    {
        using var zip=new ZipArchive(output,ZipArchiveMode.Create,true);
        await using(var stream=zip.CreateEntry("runtime.json").Open())await JsonSerializer.SerializeAsync(stream,snapshot);
        var report=new List<object>();
        foreach(var name in LogNames.Concat(DiagnosticJournal.Names)) {
            byte[] bytes;bool truncated;
            try {
                await using var source=new FileStream(Path.Combine(directory,name),FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete);
                using var buffer=new MemoryStream();var chunk=new byte[8192];const int limit=1024*1024;
                while(buffer.Length<limit){var read=await source.ReadAsync(chunk.AsMemory(0,(int)Math.Min(chunk.Length,limit-buffer.Length)));if(read==0)break;await buffer.WriteAsync(chunk.AsMemory(0,read));}
                truncated=source.Length>buffer.Length;bytes=buffer.ToArray();
            }catch(FileNotFoundException){report.Add(new{name,status="missing"});continue;}
            catch(DirectoryNotFoundException){report.Add(new{name,status="missing"});continue;}
            catch(Exception error)when(error is IOException or UnauthorizedAccessException){report.Add(new{name,status="unavailable",reason=error.GetType().Name});continue;}
            await using(var entry=zip.CreateEntry(name).Open())await entry.WriteAsync(bytes);
            report.Add(new{name,status="included",bytes=bytes.Length,truncated});
        }
        await using(var stream=zip.CreateEntry("collection.json").Open())await JsonSerializer.SerializeAsync(stream,report);
    }
}
