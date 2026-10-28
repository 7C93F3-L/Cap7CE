using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;

namespace Cap7CE.WinUI.Controllers;

// Main-window docking only. No navigation, selection, thumbnail or query ownership.
internal sealed class EdgeCollapseController : IDisposable
{
    private readonly Window window;
    private readonly EdgeWindowHost host;
    private readonly EdgeDockRegistration registration;
    private readonly EdgeWindowMotion motion;
    private readonly EdgeInputMonitor input;
    private readonly DispatcherQueueTimer leave;
    private readonly Func<bool> blocked;
    private readonly Action<UiMessage> notice;
    private EdgeInsets insets;
    private EdgeRect expanded;
    private bool enabled,pinned,collapsed,userMoving,queued,disposed,awaitingEntry;
    public EdgeCollapseController(Window owner,FrameworkElement root,Func<bool> interactionBlocked,Action<UiMessage> report)
    {
        window=owner;blocked=interactionBlocked;notice=report;host=new(owner);registration=new(host.Handle);
        motion=new(host,owner.DispatcherQueue,Wake,Fail);input=new(root,Wake);
        leave=owner.DispatcherQueue.CreateTimer();leave.Interval=TimeSpan.FromMilliseconds(400);leave.IsRepeating=false;leave.Tick+=Leave;
        host.Message=Message;WindowActivation.Showing+=Showing;window.AppWindow.Closing+=Closing;
    }
    public void Configure(bool value,bool alwaysOnTop)
    {
        if(disposed)return;pinned=alwaysOnTop;
        Safe(()=>{
            if(window.Content is FrameworkElement tree)input.Attach(tree);
            if(enabled!=value){
                if(!value)Restore();enabled=value;awaitingEntry=false;
                host.Configure(value,pinned,false);
                if(value&&host.IsRestored)DockFromBounds();
            }
            host.Configure(enabled,pinned,collapsed);Wake();
        });
    }
    public void Wake()
    {
        if(disposed||!enabled||queued)return;queued=true;
        window.DispatcherQueue.TryEnqueue(DispatcherQueuePriority.Low,()=>{queued=false;if(!disposed)Safe(Check);});
    }
    private void Check()
    {
        if(!enabled||userMoving||!host.IsRestored){leave.Stop();return;}
        if(registration.Edge is not {} edge)return;
        if(!EdgeNative.GetCursorPos(out var pointer))return;
        var current=host.Bounds;var inside=EdgeCollapseGeometry.Visible(current,insets).Contains(pointer.X,pointer.Y);
        if(inside)awaitingEntry=false;
        if(collapsed){
            if(inside&&EdgeCollapseGeometry.AtRevealEdge(pointer.X,pointer.Y,registration.Screen.Bounds,edge))Reveal();return;
        }
        if(motion.Running)return;
        // Programmatic restore/default-size actions may have moved away from the edge.
        if(current!=expanded){
            insets=host.Insets(insets);
            if(host.Screen.Bounds!=registration.Screen.Bounds||EdgeCollapseGeometry.Detect(current,insets,host.Screen,EdgeWindowHost.Screens(),edge)!=edge){registration.Release();leave.Stop();return;}
            expanded=current;
        }
        var interactionBlocked=Blocked();
        if(inside||awaitingEntry||interactionBlocked){leave.Stop();return;}
        if(!leave.IsRunning)leave.Start();
    }
    // Observe popups even while inside/dragging, so their close event always wakes us.
    private bool Blocked(){var popup=input.HasPopup;return popup||host.InteractionBlocked||blocked();}
    private void Leave(DispatcherQueueTimer sender,object args)=>Safe(()=>{
        if(!enabled||collapsed||motion.Running||userMoving||awaitingEntry||!host.IsRestored||Blocked()||registration.Edge is not {} edge)return;
        if(!EdgeNative.GetCursorPos(out var pointer)||EdgeCollapseGeometry.Visible(host.Bounds,insets).Contains(pointer.X,pointer.Y))return;
        expanded=host.Bounds;collapsed=true;host.Configure(true,pinned,true);
        motion.Start(EdgeCollapseGeometry.Collapse(expanded,insets,registration.Screen.Bounds,edge));
    });
    private void DockFromBounds()
    {
        if(!host.IsRestored)return;insets=host.Insets(insets);var screen=host.Screen;
        var edge=EdgeCollapseGeometry.Detect(host.Bounds,insets,screen,EdgeWindowHost.Screens(),registration.Edge);
        if(edge is not {} candidate){registration.Release();return;}
        try{registration.Change(candidate,screen);}
        catch(UiFailure error){notice(error.Display);return;}
        expanded=EdgeCollapseGeometry.Align(host.Bounds,insets,screen,candidate);host.Move(expanded);awaitingEntry=false;Wake();
    }
    private void Reveal(bool animate=true)
    {
        leave.Stop();if(!collapsed&&!motion.Running)return;collapsed=false;
        host.Configure(enabled,pinned,false);
        if(animate)motion.Start(expanded);else{motion.Stop();host.Move(expanded,positionOnly:true);}
    }
    private void Restore()
    {
        var transitioning=motion.Running;leave.Stop();motion.Stop();
        var target=collapsed||transitioning?expanded:host.Bounds;var hadDock=registration.Edge is not null;
        registration.Release();collapsed=false;
        if(hadDock&&!host.IsMinimized)host.Move(EdgeCollapseGeometry.Clamp(target,insets,host.Screen.Work));
    }
    private void Showing(Window target)
    {
        if(!ReferenceEquals(target,window)||!enabled||disposed)return;
        Safe(()=>{Reveal(false);leave.Stop();awaitingEntry=true;});
    }
    private void Message(uint message,nuint wParam,nint lParam)
    {
        if(!enabled||disposed)return;
        Safe(()=>{
            if(message==0x0231){userMoving=true;leave.Stop();if(collapsed)Reveal(false);motion.Stop();}
            if(message==0x0232)window.DispatcherQueue.TryEnqueue(()=>Safe(()=>{if(disposed)return;userMoving=false;DockFromBounds();Wake();}));
            if(message==0x0006&&(wParam&0xffff)!=0&&collapsed){Reveal(false);awaitingEntry=true;}
            if(message is 0x007E or 0x02E0)window.DispatcherQueue.TryEnqueue(()=>Safe(()=>{
                if(disposed||userMoving)return;Restore();host.Configure(enabled,pinned,false);Wake();
            }));
            if(message is 0x0200 or 0x00A0 or 0x02A3 or 0x02A2 or 0x0202 or 0x00A2 or 0x0215 or 0x001F or 0x0006 or 0x0047)Wake();
        });
    }
    private void Safe(Action action)
    {
        try{action();}catch(Exception error){Fail(error);}
    }
    private void Fail(Exception error)
    {
        if(disposed)return;leave.Stop();motion.Stop();
        try{Restore();}catch(Exception cleanup){NativeDiagnostics.VisualFailure(cleanup);}
        enabled=false;try{host.Configure(false,pinned,false);}catch(Exception cleanup){NativeDiagnostics.VisualFailure(cleanup);}
        NativeDiagnostics.VisualFailure(error);notice(UiMessage.Key("ui.error.edgeFailed"));
    }
    private void Closing(AppWindow sender,AppWindowClosingEventArgs args)=>Dispose();
    public void Dispose()
    {
        if(disposed)return;
        try{Restore();host.Configure(false,pinned,false);}catch(Exception error){NativeDiagnostics.VisualFailure(error);}
        disposed=true;leave.Stop();leave.Tick-=Leave;motion.Dispose();input.Dispose();host.Dispose();
        WindowActivation.Showing-=Showing;window.AppWindow.Closing-=Closing;
    }
}
