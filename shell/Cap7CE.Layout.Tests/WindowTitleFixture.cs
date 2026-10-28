namespace Microsoft.UI.Xaml;

internal sealed class WindowEventArgs : EventArgs;
internal sealed class Window
{
    private string title="";
    private bool closed;
    public FixtureDispatcher DispatcherQueue {get;}=new();
    public string Title {get=>title;set{if(closed)throw new ObjectDisposedException(nameof(Window));title=value;}}
    public event Action<object,WindowEventArgs>? Closed;
    public void Close(){closed=true;Closed?.Invoke(this,new());}
}
