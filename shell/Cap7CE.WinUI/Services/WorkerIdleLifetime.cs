namespace Cap7CE.WinUI.Services;
internal sealed class WorkerIdleLifetime(Func<Task> retire,TimeSpan delay,Action<Exception> failure,Func<bool>? retry=null)
{
    internal static bool IsAtomic(string worker,string method,object?[]? args=null)=>worker switch {
        "visual-cache.cjs"=>method is "ensure" or "ensureShell" or "sourceDimensions" or "stats" or "skimStats" or "storedMetadata" or "previewMetadata" or "cancelPreviewMetadata",
        "office-preview.cjs"=>method is "cache.stats" or "office.open" or "office.close",
        "provider-preview.cjs"=>method is "text.read" or "text.cancel" or "font.open" or "font.close" or "epub.open" or "epub.close" or "mobi.open" or "mobi.close" or "archive.open" or "archive.close" or "psd.open" or "psd.render" or "psd.close",
        "model-runtime.cjs"=>(method,args) is ("runtime.state" or "runtime.ready" or "runtime.sync" or "runtime.beginAI" or "runtime.endAI",[_,null]) or ("runtime.start",[_,"manual" or "ai"]) or ("runtime.stop",[_,string]) or ("modelSettings.invoke",[_,"runtime.settings" or "models.settings",null]) or ("modelSettings.invoke",[_,"runtime.select" or "models.select",string]),
        _=>false
    };
    private readonly SemaphoreSlim gate=new(1);
    private Timer? timer;
    private int active;
    private bool closed,eligible=true;
    private long last;
    public async Task EnterAsync(bool atomic)
    {
        await gate.WaitAsync();
        try{ObjectDisposedException.ThrowIf(closed,this);active++;eligible&=atomic;timer?.Change(Timeout.InfiniteTimeSpan,Timeout.InfiniteTimeSpan);}
        finally{gate.Release();}
    }
    public async Task LeaveAsync(bool success)
    {
        await gate.WaitAsync();
        try{
            active--;eligible&=success;
            if(closed||active!=0||!eligible)return;
            last=Environment.TickCount64;
            timer??=new Timer(_=>_ = ReapAsync(),null,Timeout.InfiniteTimeSpan,Timeout.InfiniteTimeSpan);
            timer.Change(delay,Timeout.InfiniteTimeSpan);
        }finally{gate.Release();}
    }
    private async Task ReapAsync()
    {
        await gate.WaitAsync();
        try{
            if(closed||active!=0||!eligible)return;
            var remaining=delay-TimeSpan.FromMilliseconds(Environment.TickCount64-last);
            if(remaining>TimeSpan.Zero){timer?.Change(remaining,Timeout.InfiniteTimeSpan);return;}
            await retire();eligible=true;if(retry?.Invoke()==true)timer?.Change(delay,Timeout.InfiniteTimeSpan);
        }catch(Exception error){eligible=false;failure(error);}
        finally{gate.Release();}
    }
    public async Task CloseAsync()
    {
        await gate.WaitAsync();
        try{if(closed)return;closed=true;timer?.Dispose();timer=null;await retire();}
        finally{gate.Release();}
    }
}
