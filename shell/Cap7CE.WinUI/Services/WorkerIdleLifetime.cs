namespace Cap7CE.WinUI.Services;
// Coordinates requests and retirement only; process and RPC ownership stays in CoreNodeHost.
internal sealed class WorkerIdleLifetime(Func<Task> retire,TimeSpan delay,Action<Exception> failure)
{
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
            await retire();eligible=true;
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
