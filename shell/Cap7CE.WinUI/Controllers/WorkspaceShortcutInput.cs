using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Windows.System;

namespace Cap7CE.WinUI.Controllers;

// Main-window scope only. Result keys tunnel before GridView/Button consumes Enter or Space.
internal sealed class WorkspaceShortcutInput:IDisposable
{
    private readonly Window owner;
    private readonly FrameworkElement root;
    private FrameworkElement routeRoot;
    private readonly ResultsView results;
    private readonly Action<string> execute;
    private readonly HashSet<ShortcutGesture> held=[];
    private readonly KeyEventHandler release;
    private ShellPreferences preferences=new();
    private readonly List<(ShortcutDefinition Action,ShortcutGesture Key)> appKeys=[];
    public WorkspaceShortcutInput(Window owner,FrameworkElement root,ResultsView results,Action<string> execute)
    {
        this.owner=owner;this.root=root;routeRoot=root;this.results=results;this.execute=execute;
        // Accelerators belong to this whole scope, not to a hoverable command surface.
        root.KeyboardAcceleratorPlacementMode=KeyboardAcceleratorPlacementMode.Hidden;
        release=(_,args)=>held.RemoveWhere(key=>key.Key==(uint)args.Key);
        routeRoot.AddHandler(UIElement.KeyUpEvent,release,true);routeRoot.PreviewKeyDown+=ApplicationKey;
        root.Loaded+=Loaded;owner.Activated+=Activated;
    }
    private void Loaded(object sender,RoutedEventArgs args)=>AttachWindowRoot();
    private void AttachWindowRoot()
    {
        if(owner.Content is not FrameworkElement current||ReferenceEquals(current,routeRoot))return;
        routeRoot.RemoveHandler(UIElement.KeyUpEvent,release);routeRoot.PreviewKeyDown-=ApplicationKey;
        foreach(var accelerator in accelerators)routeRoot.KeyboardAccelerators.Remove(accelerator);
        routeRoot=current;routeRoot.KeyboardAcceleratorPlacementMode=KeyboardAcceleratorPlacementMode.Hidden;
        routeRoot.AddHandler(UIElement.KeyUpEvent,release,true);routeRoot.PreviewKeyDown+=ApplicationKey;
        foreach(var accelerator in accelerators)routeRoot.KeyboardAccelerators.Add(accelerator);
        held.Clear();
    }
    private void Activated(object sender,WindowActivatedEventArgs args)
    {if(args.WindowActivationState==WindowActivationState.Deactivated)held.Clear();else AttachWindowRoot();}
    private readonly List<KeyboardAccelerator> accelerators=[];
    private List<(ShortcutDefinition Action,ShortcutGesture Key)> resultKeys=[];
    public static uint Modifiers()
    {
        bool Down(VirtualKey key)=>Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(key).HasFlag(Windows.UI.Core.CoreVirtualKeyStates.Down);
        return (Down(VirtualKey.Control)?2u:0)|(Down(VirtualKey.Menu)?1u:0)|(Down(VirtualKey.Shift)?4u:0)|(Down(VirtualKey.LeftWindows)||Down(VirtualKey.RightWindows)?8u:0);
    }
    private bool Blocked(string context)
    {
        if(ResultDrag.IsActive||root.XamlRoot is not {} xaml||VisualTreeHelper.GetOpenPopupsForXamlRoot(xaml).Any(popup=>popup.Child is not ToolTip))return true;
        if(context=="app")return false;
        for(var target=FocusManager.GetFocusedElement(xaml) as DependencyObject;target is not null;target=VisualTreeHelper.GetParent(target))
            if(target is TextBox or RichEditBox or PasswordBox or AutoSuggestBox)return true;
        return false;
    }
    public void Apply(ShellPreferences preferences)
    {
        this.preferences=preferences;
        AttachWindowRoot();
        foreach(var accelerator in accelerators)routeRoot.KeyboardAccelerators.Remove(accelerator);accelerators.Clear();resultKeys.Clear();appKeys.Clear();held.Clear();
        foreach(var action in ShortcutCatalog.All) {
            var binding=ShortcutCatalog.Binding(preferences,action);
            if(action.Scope!="app"||ShortcutCatalog.Validate(action,binding,preferences) is not null||!ShortcutGesture.TryParse(binding.Gesture,out var key))continue;
            if(action.Context=="results"){resultKeys.Add((action,key));continue;}
            appKeys.Add((action,key));
            // Default (unscoped) accelerators cover this XAML window, including its
            // title-bar sibling and periods with no focused content control.
            var accelerator=new KeyboardAccelerator{Key=(VirtualKey)key.Key,Modifiers=ToModifiers(key.Modifiers)};
            accelerator.Invoked+=(_,args)=>{if(Blocked(action.Context)||Modifiers()!=key.Modifiers)return;args.Handled=true;if(held.Add(key))execute(action.Id);};
            routeRoot.KeyboardAccelerators.Add(accelerator);accelerators.Add(accelerator);
        }
        results.HandleShortcut=ResultKey;
    }
    private void ApplicationKey(object sender,KeyRoutedEventArgs args)
    {
        var key=new ShortcutGesture((uint)args.Key,Modifiers());
        var action=appKeys.FirstOrDefault(value=>value.Key==key).Action;
        if(action is not null&&!Blocked(action.Context)){
            args.Handled=true;if(!args.KeyStatus.WasKeyDown&&held.Add(key))execute(action.Id);return;
        }
        if(!resultKeys.Any(value=>value.Key==key)&&OldDefault(key,false))args.Handled=true;
    }
    private bool OldDefault(ShortcutGesture key,bool resultsContext)
    {
        foreach(var action in ShortcutCatalog.All.Where(action=>(action.Context=="results")==resultsContext&&action.Scope=="app")) {
            if(!ShortcutGesture.TryParse(action.Gesture,out var original)||original!=key||Blocked(action.Context))continue;
            var binding=ShortcutCatalog.Binding(preferences,action);
            if(!ShortcutGesture.TryParse(binding.Gesture,out var current)||current!=original)return true;
        }
        return false;
    }
    private bool ResultKey(KeyRoutedEventArgs args)
    {
        if(Blocked("results"))return false;
        var key=new ShortcutGesture((uint)args.Key,Modifiers());
        var match=resultKeys.FirstOrDefault(value=>value.Key==key).Action;if(match is null){if(!OldDefault(key,true))return false;args.Handled=true;return true;}
        args.Handled=true;if(!args.KeyStatus.WasKeyDown)execute(match.Id);return true;
    }
    private static VirtualKeyModifiers ToModifiers(uint value)=>(value&2)!=0?VirtualKeyModifiers.Control|OtherModifiers(value):OtherModifiers(value);
    private static VirtualKeyModifiers OtherModifiers(uint value)=>((value&1)!=0?VirtualKeyModifiers.Menu:VirtualKeyModifiers.None)|((value&4)!=0?VirtualKeyModifiers.Shift:VirtualKeyModifiers.None);
    public void Dispose(){foreach(var accelerator in accelerators)routeRoot.KeyboardAccelerators.Remove(accelerator);accelerators.Clear();results.HandleShortcut=null;routeRoot.RemoveHandler(UIElement.KeyUpEvent,release);routeRoot.PreviewKeyDown-=ApplicationKey;root.Loaded-=Loaded;owner.Activated-=Activated;held.Clear();}
}
