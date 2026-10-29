using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Windowing;
using Windows.Foundation;
using Windows.Graphics;
using Cap7CE.WinUI.Models;
namespace Cap7CE.WinUI.Services;
// A dedicated, tiny tool window lets a windowed WinUI flyout work without showing the main UI.
internal sealed class TrayMenuHost : IDisposable
{
    private readonly Window window=new(){Title=ApplicationIdentity.Name};
    private readonly Grid root=new();
    private MenuFlyout? menu;
    private TaskCompletionSource<uint>? completion;
    private uint selected;
    private bool opening,finishing,disposed;
    public TrayMenuHost()
    {
        window.Content=root;window.AppWindow.IsShownInSwitchers=false;
        if(window.AppWindow.Presenter is OverlappedPresenter presenter){presenter.SetBorderAndTitleBar(false,false);presenter.PreferredMinimumWidth=1;presenter.PreferredMinimumHeight=1;presenter.IsResizable=false;presenter.IsMaximizable=false;presenter.IsMinimizable=false;}
        window.AppWindow.Resize(new SizeInt32(2,2));
        TrayNative.MakeInvisible(WinRT.Interop.WindowNative.GetWindowHandle(window));
        root.Loaded+=(_,_)=>OpenFlyout();root.ActualThemeChanged+=(_,_)=>ApplyPresenterTheme();
        window.AppWindow.Closing+=(_,args)=>{if(!disposed){args.Cancel=true;menu?.Hide();}};
    }
    public void SetTheme(string preference)
    {
        if(disposed)return;root.RequestedTheme=preference switch{"light"=>ElementTheme.Light,"dark"=>ElementTheme.Dark,_=>ElementTheme.Default};
        ApplyPresenterTheme();
    }
    public Task<uint> ShowAsync(bool edge,bool login,string runtime,bool busy,string theme)
    {
        ObjectDisposedException.ThrowIf(disposed,this);
        if(completion is not null)return completion.Task;
        if(!TrayNative.GetCursorPos(out var cursor))throw new InvalidOperationException("tray-position-unavailable");
        var work=DisplayArea.GetFromPoint(new PointInt32(cursor.X,cursor.Y),DisplayAreaFallback.Nearest).WorkArea;
        var anchor=TrayMenuPlacement.Clamp(cursor.X,cursor.Y,work.X,work.Y,work.Width,work.Height);
        window.AppWindow.Move(new PointInt32(anchor.X,anchor.Y));SetTheme(theme);
        selected=0;completion=new(TaskCreationOptions.RunContinuationsAsynchronously);var task=completion.Task;
        menu=TrayMenu.Create(edge,login,runtime,busy,value=>{selected=value;menu?.Hide();});
        menu.MenuFlyoutPresenterStyle=new Style{TargetType=typeof(MenuFlyoutPresenter),Setters={new Setter(FrameworkElement.RequestedThemeProperty,root.ActualTheme)}};
        menu.Opened+=(_,_)=>ApplyPresenterTheme();menu.Closed+=(_,_)=>Finish();
        try{window.Activate();if(root.IsLoaded)OpenFlyout();}catch(Exception error){Finish(error);}
        return task;
    }
    private void OpenFlyout()
    {
        if(menu is null||opening||disposed)return;opening=true;
        try{menu.ShowAt(root,new FlyoutShowOptions{Position=new Point(0,0),Placement=FlyoutPlacementMode.TopEdgeAlignedRight});}
        catch(Exception error){Finish(error);}
    }
    private void ApplyPresenterTheme()
    {
        if(disposed||root.XamlRoot is null)return;
        foreach(var popup in VisualTreeHelper.GetOpenPopupsForXamlRoot(root.XamlRoot))
            if(popup.Child is FrameworkElement presenter)presenter.RequestedTheme=root.ActualTheme;
    }
    private void Finish(Exception? error=null)
    {
        if(finishing||completion is null)return;finishing=true;
        var pending=completion;completion=null;menu=null;opening=false;
        if(!disposed)window.AppWindow.Hide();
        if(error is null)pending.TrySetResult(selected);else pending.TrySetException(error);
        finishing=false;
    }
    public void Dispose()
    {
        if(disposed)return;disposed=true;menu?.Hide();Finish();window.Close();
    }
}
