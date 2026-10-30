using System.Diagnostics;

namespace Cap7CE.WinUI.Services;

internal static class SessionDiagnostics
{
    private static DiagnosticJournal? journal;
    private static long sequence;
    public static void Start(string directory)
    {
        journal=new(directory);
        journal.Write("session.start",new{version=typeof(SessionDiagnostics).Assembly.GetName().Version?.ToString(),
            build=typeof(SessionDiagnostics).Module.ModuleVersionId,os=Environment.OSVersion.VersionString,
            fixture=Environment.GetEnvironmentVariable("CAP7CE_PHASEF_CATALOG") is not null},newSession:true);
        AppDomain.CurrentDomain.UnhandledException+=(_,e)=>Record("exception.domain",new{e.IsTerminating,error=Error(e.ExceptionObject as Exception)});
        AppDomain.CurrentDomain.ProcessExit+=(_,_)=>Record("session.exit");
    }
    public static void Record(string name,object? detail=null){try{journal?.Write(name,detail);}catch{}}
    public static object? Error(Exception? error)
    {
        if(error is null)return null;
        var text=error.ToString();var core=error.Data["CoreMessage"]?.ToString();
        return new{type=error.GetType().FullName,hresult=$"0x{error.HResult:X8}",text=text[..Math.Min(text.Length,8000)],core=core?[..Math.Min(core.Length,2000)]};
    }
    public static Operation Begin(string name,object? detail=null)=>new(name,Interlocked.Increment(ref sequence),detail);
    internal sealed class Operation : IDisposable
    {
        private readonly string name;
        private readonly long id;
        private readonly Stopwatch watch=Stopwatch.StartNew();
        private string outcome="finished";
        internal Operation(string name,long id,object? detail){this.name=name;this.id=id;Record(name+".begin",new{id,detail});}
        public void Fail(Exception error){outcome=error is OperationCanceledException?"canceled":"failed";Record(name+".error",new{id,error=Error(error)});}
        public void Mark(string stage,object? detail=null)=>Record(name+".stage",new{id,stage,detail});
        public void Dispose()=>Record(name+".end",new{id,outcome,elapsedMs=Math.Round(watch.Elapsed.TotalMilliseconds,2)});
    }
}
