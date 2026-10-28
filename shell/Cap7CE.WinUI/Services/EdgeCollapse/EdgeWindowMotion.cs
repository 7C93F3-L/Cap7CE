using System.Diagnostics;
using Cap7CE.WinUI.Models;
using Microsoft.UI.Dispatching;

namespace Cap7CE.WinUI.Services;

// The only repeating timer is bounded to one 180 ms movement, never idle work.
internal sealed class EdgeWindowMotion : IDisposable
{
    private readonly EdgeWindowHost host;
    private readonly DispatcherQueueTimer timer;
    private readonly Stopwatch clock=new();
    private readonly Action completed;
    private readonly Action<Exception> failed;
    private EdgeRect start,target;
    public bool Running=>timer.IsRunning;
    public EdgeWindowMotion(EdgeWindowHost window,DispatcherQueue queue,Action ended,Action<Exception> error)
    {
        host=window;completed=ended;failed=error;timer=queue.CreateTimer();timer.Interval=TimeSpan.FromMilliseconds(16);timer.IsRepeating=true;timer.Tick+=Tick;
    }
    public void Start(EdgeRect destination)
    {
        Stop();start=host.Bounds;target=destination;
        if(start.Width!=target.Width||start.Height!=target.Height){host.Move(target);completed();return;}
        clock.Restart();timer.Start();
    }
    private void Tick(DispatcherQueueTimer sender,object args)
    {
        try{
            if(!host.IsRestored){Stop();return;}
            var t=Math.Clamp(clock.Elapsed.TotalMilliseconds/180d,0,1);var eased=1-Math.Pow(1-t,3);
            var x=(int)Math.Round((target.Left-start.Left)*eased);var y=(int)Math.Round((target.Top-start.Top)*eased);
            host.Move(start.Offset(x,y),positionOnly:true);
            if(t>=1){Stop();completed();}
        }catch(Exception error){Stop();failed(error);}
    }
    public void Stop(){timer.Stop();clock.Stop();}
    public void Dispose(){Stop();timer.Tick-=Tick;}
}
