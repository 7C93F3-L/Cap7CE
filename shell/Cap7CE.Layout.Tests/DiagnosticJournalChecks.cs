using System.Text.Json;
using Cap7CE.WinUI.Services;

internal static class DiagnosticJournalChecks
{
    public static async Task RunAsync()
    {
        var root=Path.Combine(Path.GetTempPath(),"cap7ce-journal-"+Guid.NewGuid().ToString("N"));
        try {
            var journal=new DiagnosticJournal(root);
            await Task.WhenAll(Enumerable.Range(0,8).Select(worker=>Task.Run(()=>{
                for(var i=0;i<20;i++)journal.Write("concurrent",new{worker,i});
            })));
            var lines=File.ReadAllLines(Path.Combine(root,DiagnosticJournal.Names[0]));
            if(lines.Length!=160)throw new Exception("Concurrent journal events lost.");
            string? session=null;
            for(var i=0;i<lines.Length;i++){
                using var json=JsonDocument.Parse(lines[i]);var row=json.RootElement;
                session??=row.GetProperty("session").GetString();
                if(row.GetProperty("session").GetString()!=session||row.GetProperty("sequence").GetInt64()!=i+1)throw new Exception("Journal session/order corrupted.");
            }
            for(var i=0;i<6;i++)new DiagnosticJournal(root).Write("session.start",new{i},newSession:true);
            if(Directory.GetFiles(root).Length!=4)throw new Exception("Session retention exceeded four files.");
            using(var oldest=JsonDocument.Parse(File.ReadAllText(Path.Combine(root,DiagnosticJournal.Names[3]))))
                if(oldest.RootElement.GetProperty("detail").GetProperty("i").GetInt32()!=2)throw new Exception("Session rotation order incorrect.");
            var bounded=new DiagnosticJournal(root,1024);
            for(var i=0;i<40;i++)bounded.Write("bounded",new{i,text=new string('中',80)});
            if(Directory.GetFiles(root).Any(file=>new FileInfo(file).Length>1024))throw new Exception("UTF8 byte limit exceeded.");
            using(var held=new FileStream(Path.Combine(root,DiagnosticJournal.Names[0]),FileMode.Open,FileAccess.ReadWrite,FileShare.None))bounded.Write("locked");
            var blocked=Path.Combine(root,"blocked");File.WriteAllText(blocked,"file");
            new DiagnosticJournal(blocked).Write("unwritable");
            var failure=new IOException("sample");failure.Data["CoreMessage"]="detail";
            using var error=JsonDocument.Parse(JsonSerializer.Serialize(SessionDiagnostics.Error(failure)));
            if(error.RootElement.GetProperty("core").GetString()!="detail"||!error.RootElement.GetProperty("hresult").GetString()!.StartsWith("0x"))throw new Exception("Exception context lost.");
            Console.WriteLine("Diagnostic journal passed: concurrent JSONL order, session/byte retention, locked/unwritable sink and exception context.");
        }finally{if(Directory.Exists(root))Directory.Delete(root,true);}
    }
}
