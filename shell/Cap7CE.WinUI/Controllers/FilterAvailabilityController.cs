using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Controllers;
// Event-driven, cancelable existence checks. No polling or persistence.
internal sealed class FilterAvailabilityController(Action<FilterAvailability> publish) : IDisposable
{
    private CancellationTokenSource? pending;
    private string key="";
    private int generation;
    private bool disposed;
    internal Task Completion {get;private set;}=Task.CompletedTask;
    public bool IsCurrent(FilterAvailability state)=>!disposed&&state.Revision==generation;
    public void Update(string next,IReadOnlyList<string> kinds,Func<string,bool,CancellationToken,Task<bool>> probe,bool force=false)
    {
        if(disposed||!force&&key==next)return;
        key=next;var version=++generation;pending?.Cancel();pending?.Dispose();pending=new();
        var states=new Dictionary<string,FilterAvailabilityState>();
        foreach(var kind in kinds) {
            states[kind]=FilterAvailabilityState.Checking;
            if(kind is "image-dimensions" or "video")states[kind+":colors"]=FilterAvailabilityState.Checking;
        }
        var token=pending.Token;Publish();Completion=Run();
        void Publish(){if(!disposed&&version==generation)publish(new(new Dictionary<string,FilterAvailabilityState>(states),version));}
        async Task Run()
        {
            using var timeout=CancellationTokenSource.CreateLinkedTokenSource(token);timeout.CancelAfter(TimeSpan.FromSeconds(6));
            try {
                foreach(var kind in kinds) {
                    var available=await probe(kind,false,timeout.Token);if(version!=generation||disposed)return;
                    states[kind]=available?FilterAvailabilityState.Available:FilterAvailabilityState.Missing;Publish();
                    if(kind is "image-dimensions" or "video") {
                        var colors=available&&await probe(kind,true,timeout.Token);if(version!=generation||disposed)return;
                        states[kind+":colors"]=colors?FilterAvailabilityState.Available:FilterAvailabilityState.Missing;Publish();
                    }
                }
            }
            catch(Exception error) when(error is not OutOfMemoryException) {
                if(version!=generation||disposed)return;
                foreach(var name in states.Keys.ToArray())if(states[name]==FilterAvailabilityState.Checking)states[name]=FilterAvailabilityState.Failed;
                Publish();
            }
        }
    }
    public void Dispose(){disposed=true;++generation;pending?.Cancel();pending?.Dispose();pending=null;}
}
