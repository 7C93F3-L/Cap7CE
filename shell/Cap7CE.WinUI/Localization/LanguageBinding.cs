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
    private bool subscribed;
    private LanguageBinding(FrameworkElement element,DependencyProperty property,LanguageSession session,string key,Func<IReadOnlyDictionary<string,object?>?>? parameters)
    {
        this.element=element;this.property=property;this.session=session;this.key=key;this.parameters=parameters;
        element.Loaded+=Loaded;element.Unloaded+=Unloaded;
        Refresh();if(element.IsLoaded)Subscribe();
    }
    public static void Attach(FrameworkElement element,DependencyProperty property,LanguageSession session,string key,Func<IReadOnlyDictionary<string,object?>?>? parameters=null)
    {
        var bindings=Bindings.GetOrCreateValue(element);
        if(bindings.Remove(property,out var previous))previous.Detach();
        bindings[property]=new LanguageBinding(element,property,session,key,parameters);
    }
    private void Refresh()=>element.SetValue(property,session.Text(key,parameters?.Invoke()));
    private void Loaded(object sender,RoutedEventArgs args){Subscribe();Refresh();}
    private void Subscribe(){if(subscribed)return;session.Changed+=Changed;subscribed=true;}
    private void Changed()
    {
        if(element.DispatcherQueue.HasThreadAccess)Refresh();
        else element.DispatcherQueue.TryEnqueue(()=>{if(subscribed)Refresh();});
    }
    private void Unloaded(object sender,RoutedEventArgs args){session.Changed-=Changed;subscribed=false;}
    private void Detach(){element.Loaded-=Loaded;element.Unloaded-=Unloaded;session.Changed-=Changed;subscribed=false;}
}
