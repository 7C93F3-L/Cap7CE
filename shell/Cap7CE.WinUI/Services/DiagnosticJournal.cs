using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace Cap7CE.WinUI.Services;

// Low-frequency lifecycle events only; never used for thumbnails or individual files.
internal sealed class DiagnosticJournal(string directory,int limit=512*1024)
{
    private readonly object gate=new();
    private readonly string session=Guid.NewGuid().ToString("N");
    private readonly Stopwatch uptime=Stopwatch.StartNew();
    private long sequence;
    public static readonly string[] Names=["session-trace.jsonl","session-trace.1.jsonl","session-trace.2.jsonl","session-trace.3.jsonl"];
    public void Write(string name,object? detail=null,bool newSession=false)
    {
        try { lock(gate) {
            Directory.CreateDirectory(directory);
            var path=Path.Combine(directory,Names[0]);
            var line=JsonSerializer.Serialize(new{time=DateTimeOffset.Now,session,sequence=++sequence,pid=Environment.ProcessId,
                thread=Environment.CurrentManagedThreadId,uptimeMs=Math.Round(uptime.Elapsed.TotalMilliseconds,2),name,detail})+"\n";
            if(Encoding.UTF8.GetByteCount(line)>limit)return;
            if(File.Exists(path)&&(newSession||new FileInfo(path).Length+Encoding.UTF8.GetByteCount(line)>limit)) {
                for(var i=Names.Length-1;i>0;i--){var source=Path.Combine(directory,Names[i-1]);if(File.Exists(source))File.Move(source,Path.Combine(directory,Names[i]),true);}
            }
            using var stream=new FileStream(path,FileMode.Append,FileAccess.Write,FileShare.ReadWrite|FileShare.Delete);
            stream.Write(Encoding.UTF8.GetBytes(line));
        }}catch { /* Diagnostics must never prevent the original operation. */ }
    }
}
