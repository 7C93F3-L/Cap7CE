using System.Runtime.InteropServices;
using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Controls.Primitives;
using Windows.Foundation;
namespace Cap7CE.WinUI.DesktopActions;
// Independent native window; no main-window mode, query or process ownership.
internal sealed class CapsuleWindow : Window
{
    private readonly ShellServices services;
    private readonly Action<DesktopSearch> replay;
    private readonly Action<DesktopProgram,int> run;
    private readonly Action settings,openMain,exit;
    private readonly Action<Exception> failure;
    private readonly CapsuleAppearance pill=new();
    private readonly Grid root=new();
    private readonly CapsuleWindowFrame frame;
    private readonly CapsuleShadowWindow shadow=new();
    private FlyoutBase? menu;
    private bool pressed,moved,shown,closed;
    private uint appliedDpi;
    private NativePoint start;
    private Windows.Graphics.PointInt32 origin;
    public CapsuleWindow(ShellServices services,Action<DesktopSearch> replay,Action<DesktopProgram,int> run,Action settings,Action openMain,Action exit,Action<Exception> failure)
    {
        this.services=services;this.replay=replay;this.run=run;this.settings=settings;this.openMain=openMain;this.exit=exit;this.failure=failure;
        Content=root;root.Children.Add(pill);Title="Cap7CE";
        var presenter=OverlappedPresenter.Create();presenter.SetBorderAndTitleBar(false,false);
        presenter.IsResizable=false;presenter.IsMaximizable=false;presenter.IsMinimizable=false;presenter.IsAlwaysOnTop=true;
        AppWindow.SetPresenter(presenter);AppWindow.IsShownInSwitchers=false;
        frame=new(this,presenter);SystemBackdrop=new CapsuleTransparentBackdrop();
        pill.PointerPressed+=Pressed;pill.PointerMoved+=Moved;pill.PointerReleased+=Released;
        pill.RightTapped+=(_,e)=>{e.Handled=true;ShowMenu(true);};
        pill.PointerCanceled+=(_,_)=>pressed=false;pill.PointerCaptureLost+=(_,_)=>pressed=false;
        pill.KeyDown+=(_,e)=>{if(e.Key is Windows.System.VirtualKey.Enter or Windows.System.VirtualKey.Space){e.Handled=true;ShowMenu();}};
        pill.IsTabStop=true;Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(pill,AppLanguage.Text("ui.desktop.capsule"));
        AppWindow.Changed+=(_,_)=>{if(shown&&!closed){RefreshShadow();if(!pressed&&Dpi()!=appliedDpi)DispatcherQueue.TryEnqueue(()=>{if(!closed&&!pressed)Configure();});}};
        Activated+=(_,_)=>{if(shown&&!closed)RefreshShadow();};
        Closed+=(_,_)=>{closed=true;shadow.Dispose();menu?.Hide();SystemBackdrop=null;frame.Dispose();};
    }
    public void Configure()
    {
        if(closed)return;var options=services.DesktopActions.Current;
        root.RequestedTheme=services.Preferences.Current.Theme switch{"light"=>ElementTheme.Light,"dark"=>ElementTheme.Dark,_=>ElementTheme.Default};
        root.SetValue(Control.FontSizeProperty,Models.ShellPreferences.DefaultUiFontSize);
        root.Language=AppLanguage.Text("language.tag");
        var area=options.X==int.MinValue?DisplayArea.GetFromWindowId(AppWindow.Id,DisplayAreaFallback.Nearest).WorkArea:
            DisplayArea.GetFromRect(new(options.X,options.Y,1,1),DisplayAreaFallback.Nearest).WorkArea;
        appliedDpi=Dpi();var scale=appliedDpi/96d;var shortSide=(int)Math.Round(options.Size*scale);var longSide=shortSide*3;
        var width=options.Vertical?shortSide:longSide;var height=options.Vertical?longSide:shortSide;
        pill.Margin=new(CapsuleShape.InsetPixels/scale);
        pill.Configure(services.Preferences.Current.Color1,services.Preferences.Current.Color2,options.Vertical,CapsuleShape.RadiusPixels(width,height)/scale,scale,shortSide/scale);
        var x=options.X==int.MinValue?area.X+area.Width-width:Math.Clamp(options.X,area.X,Math.Max(area.X,area.X+area.Width-width));
        var y=options.Y==int.MinValue?area.Y+Math.Max(0,(area.Height-height)/2):Math.Clamp(options.Y,area.Y,Math.Max(area.Y,area.Y+area.Height-height));
        if(!pressed)AppWindow.MoveAndResize(new(x,y,width,height));
        if(!shown){shown=true;AppWindow.Show(false);}
        frame.Apply();RefreshShadow();
    }
    private void RefreshShadow(){var pos=AppWindow.Position;var size=AppWindow.Size;shadow.Update(WinRT.Interop.WindowNative.GetWindowHandle(this),pos.X,pos.Y,size.Width,size.Height,Dpi()/96d,AppWindow.IsVisible);}
    private uint Dpi(){var dpi=GetDpiForWindow(WinRT.Interop.WindowNative.GetWindowHandle(this));return dpi==0?96:dpi;}
    private void Pressed(object sender,PointerRoutedEventArgs e)
    {
        if(!e.GetCurrentPoint(pill).Properties.IsLeftButtonPressed)return;
        menu?.Hide();GetCursorPos(out start);origin=AppWindow.Position;moved=false;pressed=true;pill.CapturePointer(e.Pointer);e.Handled=true;
    }
    private void Moved(object sender,PointerRoutedEventArgs e)
    {
        if(!pressed)return;GetCursorPos(out var next);var dx=next.X-start.X;var dy=next.Y-start.Y;
        if(!moved&&Math.Abs(dx)+Math.Abs(dy)<6*Dpi()/96d)return;
        moved=true;AppWindow.Move(new(origin.X+dx,origin.Y+dy));
    }
    private async void Released(object sender,PointerRoutedEventArgs e)
    {
        if(!pressed)return;pressed=false;pill.ReleasePointerCapture(e.Pointer);e.Handled=true;
        if(!moved){ShowMenu();return;}
        try{
            var area=DisplayArea.GetFromWindowId(AppWindow.Id,DisplayAreaFallback.Nearest).WorkArea;
            var pos=AppWindow.Position;var size=AppWindow.Size;
            var distances=new[]{Math.Abs(pos.X-area.X),Math.Abs(pos.X+size.Width-area.X-area.Width),Math.Abs(pos.Y-area.Y),Math.Abs(pos.Y+size.Height-area.Y-area.Height)};
            var edge=Array.IndexOf(distances,distances.Min());var vertical=edge<2;
            var shortSide=(int)Math.Round(services.DesktopActions.Current.Size*Dpi()/96d);
            var width=vertical?shortSide:shortSide*3;var height=vertical?shortSide*3:shortSide;
            var x=edge==0?area.X:edge==1?area.X+area.Width-width:Math.Clamp(pos.X,area.X,Math.Max(area.X,area.X+area.Width-width));
            var y=edge==2?area.Y:edge==3?area.Y+area.Height-height:Math.Clamp(pos.Y,area.Y,Math.Max(area.Y,area.Y+area.Height-height));
            await services.DesktopActions.UpdateAsync(v=>v with{X=x,Y=y,Vertical=vertical});
        }catch(Exception error){failure(error);}
    }
    private void ShowMenu(bool management=false)
    {
        FlyoutBase next;
        if(management){
            var context=new MenuFlyout();var open=new MenuFlyoutItem{Text=AppLanguage.Text("ui.tray.open")};
            open.Click+=(_,_)=>{menu?.Hide();openMain();};context.Items.Add(open);
            var configure=new MenuFlyoutItem{Text=AppLanguage.Text("ui.desktop.settings")};
            configure.Click+=(_,_)=>{menu?.Hide();settings();};context.Items.Add(configure);
            var hide=new MenuFlyoutItem{Text=AppLanguage.Text("ui.desktop.hide")};
            hide.Click+=async(_,_)=>{menu?.Hide();try{await services.DesktopActions.UpdateAsync(v=>v with{Enabled=false});}catch(Exception error){failure(error);}};context.Items.Add(hide);
            context.Items.Add(new MenuFlyoutSeparator());var quit=new MenuFlyoutItem{Text=AppLanguage.Text("ui.tray.exit")};
            quit.Click+=(_,_)=>{menu?.Hide();exit();};context.Items.Add(quit);next=context;
        }else{
            var flyout=ThemeService.Flyout(new CapsuleMenu(services.DesktopActions.Current,item=>{menu?.Hide();replay(item);},(app,layout)=>{menu?.Hide();run(app,layout);}));
            var style=new Style(typeof(FlyoutPresenter));style.Setters.Add(new Setter(Control.PaddingProperty,new Thickness(0)));
            style.Setters.Add(new Setter(Control.BackgroundProperty,Application.Current.Resources["CapFlyoutSurfaceBrush"]));
            style.Setters.Add(new Setter(Control.CornerRadiusProperty,Application.Current.Resources["CapPanelRadius"]));
            flyout.FlyoutPresenterStyle=style;next=flyout;
        }
        menu?.Hide();menu=next;
        next.Opened+=(_,_)=>{if(!closed&&ReferenceEquals(menu,next))pill.SetExpanded(true);};
        next.Closed+=(_,_)=>{
            if(closed||!ReferenceEquals(menu,next))return;
            var pos=AppWindow.Position;var size=AppWindow.Size;
            var inside=GetCursorPos(out var pointer)&&CapsuleShape.Contains(size.Width,size.Height,pointer.X-pos.X,pointer.Y-pos.Y);
            pill.SetExpanded(false,inside);
        };
        var area=DisplayArea.GetFromWindowId(AppWindow.Id,DisplayAreaFallback.Nearest).WorkArea;var pos=AppWindow.Position;
        menu.Placement=services.DesktopActions.Current.Vertical?(pos.X<area.X+area.Width/2?FlyoutPlacementMode.Right:FlyoutPlacementMode.Left)
            :(pos.Y<area.Y+area.Height/2?FlyoutPlacementMode.Bottom:FlyoutPlacementMode.Top);
        try{pill.SetExpanded(true);next.ShowAt(pill);}
        catch(Exception error){pill.SetExpanded(false);failure(error);}
    }
    private struct NativePoint {public int X,Y;}
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out NativePoint point);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(nint handle);
}
