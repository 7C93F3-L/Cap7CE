namespace Cap7CE.WinUI.Services;
// Session-local invalidation for user mutations, shared by settings, commands and tray.
internal sealed class ModelChanges
{
    private int pending;
    public bool Busy=>pending!=0;
    public event Action? Changed;
    public async Task<T> RunAsync<T>(Func<Task<T>> work)
    {
        pending++;
        try{Changed?.Invoke();return await work();}
        finally{pending--;Changed?.Invoke();}
    }
}
