using Microsoft.UI.Xaml;
using System.Runtime.CompilerServices;

namespace Cap7CE.WinUI.Localization;

// An explicit property binding cannot accidentally translate a file name or user keyword.
// Loaded/Unloaded controls subscription lifetime; detached pages do not stay alive.
internal sealed class LanguageBinding
{
    private static readonly ConditionalWeakTable<FrameworkElement,Dictionary<DependencyProperty,LanguageBinding>> Bindings=new();
    private readonly FrameworkElement element;
    private readonly DependencyProperty property;
    private readonly LanguageSession session;
    private readonly string key;
    private readonly Func<IReadOnlyDictionary<string,object?>?>? parameters;
    private readonly Action<string>? apply;
    private bool subscribed;
    private LanguageBinding(FrameworkElement element,DependencyProperty property,LanguageSession session,string key,Func<IReadOnlyDictionary<string,object?>?>? parameters,Action<string>? apply)
    {
        this.element=element;this.property=property;this.session=session;this.key=key;this.parameters=parameters;this.apply=apply;
        element.Loaded+=Loaded;element.Unloaded+=Unloaded;
        Refresh();if(element.IsLoaded)Subscribe();
    }
    public static void Attach(FrameworkElement element,DependencyProperty property,LanguageSession session,string key,Func<IReadOnlyDictionary<string,object?>?>? parameters=null,Action<string>? apply=null)
    {
        var bindings=Bindings.GetOrCreateValue(element);
        if(bindings.Remove(property,out var previous))previous.Detach();
        bindings[property]=new LanguageBinding(element,property,session,key,parameters,apply);
    }
    public static void Clear(FrameworkElement element,DependencyProperty property)
    {if(Bindings.TryGetValue(element,out var bindings)&&bindings.Remove(property,out var previous))previous.Detach();}
    private void Refresh(){var text=session.Text(key,parameters?.Invoke());if(apply is null)element.SetValue(property,text);else apply(text);}
    private void Loaded(object sender,RoutedEventArgs args){Subscribe();Refresh();}
    private void Subscribe(){if(subscribed)return;session.Changed+=Changed;subscribed=true;}
    private void Changed()
    {
        if(!subscribed)return;
        if(element.DispatcherQueue.HasThreadAccess)Refresh();
        else element.DispatcherQueue.TryEnqueue(()=>{if(subscribed)Refresh();});
    }
    private void Unloaded(object sender,RoutedEventArgs args)
    {
        // Reparenting the window content can deliver Unloaded after the next Loaded.
        // Let the native tree settle before deciding whether this owner is detached.
        if(!element.IsLoaded){Unsubscribe();return;}
        if(!element.DispatcherQueue.TryEnqueue(()=>{if(!element.IsLoaded)Unsubscribe();}))Unsubscribe();
    }
    private void Unsubscribe(){session.Changed-=Changed;subscribed=false;}
    private void Detach(){element.Loaded-=Loaded;element.Unloaded-=Unloaded;session.Changed-=Changed;subscribed=false;}
}
