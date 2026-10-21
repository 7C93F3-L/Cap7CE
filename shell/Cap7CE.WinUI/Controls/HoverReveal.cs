using System.Runtime.CompilerServices;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;

namespace Cap7CE.WinUI.Controls;

// Opacity preserves the layout slot and keyboard tab order of contextual actions.
internal static class HoverReveal
{
    private static readonly ConditionalWeakTable<ButtonBase,State> states=new();
    public static void Attach(FrameworkElement scope,ButtonBase button)
    {
        if(!states.TryGetValue(button,out _))states.Add(button,new State(scope,button));
    }
    public static void Hold(ButtonBase button,bool value)
    {
        if(states.TryGetValue(button,out var state))state.Hold(value);
    }

    private sealed class State
    {
        private readonly FrameworkElement scope;
        private readonly ButtonBase button;
        private bool hovered,held;
        public State(FrameworkElement scope,ButtonBase button)
        {
            this.scope=scope;this.button=button;
            scope.PointerEntered+=(_,_)=>{hovered=true;Update();};
            scope.PointerMoved+=(_,args)=>{
                var point=args.GetCurrentPoint(scope).Position;
                var inside=point.X>=0&&point.Y>=0&&point.X<scope.ActualWidth&&point.Y<scope.ActualHeight;
                if(hovered==inside)return;hovered=inside;Update();
            };
            scope.PointerExited+=(_,args)=>{
                var point=args.GetCurrentPoint(scope).Position;
                if(point.X>=0&&point.Y>=0&&point.X<scope.ActualWidth&&point.Y<scope.ActualHeight)return;
                hovered=false;Update();
            };
            scope.GotFocus+=(_,_)=>Update();
            scope.LostFocus+=(_,_)=>scope.DispatcherQueue.TryEnqueue(Update);
            scope.Loaded+=(_,_)=>Update();
            scope.Unloaded+=(_,_)=>{hovered=held=false;Update();};
            Update();
        }
        public void Hold(bool value)
        {
            held=value;
            // Windowed popups can consume the owner's PointerExited event.
            // The native button state is refreshed again after focus restoration.
            if(!value)hovered=button.IsPointerOver;
            Update();
            if(!value)scope.DispatcherQueue.TryEnqueue(()=>{if(held)return;hovered=button.IsPointerOver;Update();});
        }
        private void Update()
        {
            var visible=scope.IsLoaded&&(hovered||held||ContainsFocus());
            button.Opacity=visible?1:0;button.IsHitTestVisible=visible;
        }
        private bool ContainsFocus()
        {
            if(scope.XamlRoot is null)return false;
            if(FocusManager.GetFocusedElement(scope.XamlRoot) is not Control {FocusState:FocusState.Keyboard} focused)return false;
            for(DependencyObject? node=focused;node is not null;node=VisualTreeHelper.GetParent(node))
                if(ReferenceEquals(node,scope))return true;
            return false;
        }
    }
}
