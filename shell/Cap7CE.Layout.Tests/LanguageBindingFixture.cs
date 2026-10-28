// Minimal event/property/dispatcher surface for exercising the real binding owner.
// This tests its subscription algorithm; it does not replace native WinUI visual QA.
namespace Microsoft.UI.Xaml;

internal sealed class DependencyProperty;
internal sealed class RoutedEventArgs : EventArgs;
internal delegate void RoutedEventHandler(object sender,RoutedEventArgs args);
internal sealed class FixtureDispatcher
{
    public bool HasThreadAccess {get;set;}=true;
    private readonly Queue<Action> pending=new();
    public bool TryEnqueue(Action callback){pending.Enqueue(callback);return true;}
    public void Drain(){while(pending.TryDequeue(out var callback))callback();}
}
internal sealed class FrameworkElement
{
    private readonly Dictionary<DependencyProperty,object?> values=new();
    public bool IsLoaded {get;private set;}
    public FixtureDispatcher DispatcherQueue {get;}=new();
    public event RoutedEventHandler? Loaded,Unloaded;
    public void SetValue(DependencyProperty property,object? value)=>values[property]=value;
    public object? GetValue(DependencyProperty property)=>values.GetValueOrDefault(property);
    public void Load(){IsLoaded=true;Loaded?.Invoke(this,new());}
    public void Unload(){IsLoaded=false;Unloaded?.Invoke(this,new());}
}
