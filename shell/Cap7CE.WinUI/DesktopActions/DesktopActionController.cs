using Cap7CE.WinUI.Controllers;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
namespace Cap7CE.WinUI.DesktopActions;
// Composition only: browse restoration stays on BrowseSession's existing navigation chain.
internal sealed class DesktopActionController : IDisposable
{
    private readonly Window main;
    private readonly ShellServices services;
    private readonly BrowseSession session;
    private readonly WorkspaceToolbar toolbar;
    private readonly Action<UiMessage> notice;
    private readonly Action settings;
    private readonly CancellationTokenSource lifetime=new();
    private CapsuleWindow? capsule;
    private CancellationTokenSource? operation;
    private bool disposed,ready;
    public DesktopActionController(Window main,ShellServices services,BrowseSession session,WorkspaceToolbar toolbar,Action settings,Action<UiMessage> notice)
    {
        this.main=main;this.services=services;this.session=session;this.toolbar=toolbar;this.settings=settings;this.notice=notice;
        services.DesktopActions.Changed+=Changed;services.Preferences.Changed+=Changed;toolbar.SearchSubmitted+=Remember;
        toolbar.SetSearchHistory(History,ClearHistory);main.Activated+=MainActivated;
    }
    public async Task InitializeAsync(){try{await services.DesktopActions.LoadAsync();}catch(Exception e){notice(FailureText.From(e));}ready=true;Changed();}
    private void Changed()=>main.DispatcherQueue.TryEnqueue(()=>{
        if(disposed||!ready)return;
        toolbar.SetSearchHistory(History,ClearHistory);
        if(!services.DesktopActions.Current.Enabled){operation?.Cancel();capsule?.Close();capsule=null;return;}
        capsule??=new(services,Replay,RunProgram,settings,error=>notice(FailureText.From(error)));
        capsule.Configure();
    });
    private IReadOnlyList<string> History(string text)=>!ready||disposed?[]:ScopedSearchHistory.Select(services.DesktopActions.Current,session.PathValue,session.PreferenceScope==WorkspacePreferenceScope.Favorites,session.EntryPath,text);
    private async void ClearHistory()
    {
        if(disposed)return;toolbar.CloseSearchHistory();
        try{await services.DesktopActions.ClearHistoryAsync();}
        catch(Exception error){if(!disposed)notice(FailureText.From(error));}
    }
    private void MainActivated(object sender,WindowActivatedEventArgs args){if(args.WindowActivationState==WindowActivationState.Deactivated)toolbar.CloseSearchHistory();}
    private async void Remember(string query)
    {
        if(string.IsNullOrWhiteSpace(query)||!ready||!services.DesktopActions.Current.RecordHistory)return;
        var item=new DesktopSearch(query.Trim(),session.PathValue,session.PreferenceScope==WorkspacePreferenceScope.Favorites,session.EntryPath,session.Filter,session.Recursive);
        try{await services.DesktopActions.RememberAsync(item);}catch(Exception e){notice(FailureText.From(e));}
    }
    private async void Replay(DesktopSearch item)
    {
        try{
            WindowActivation.Show(main);
            if(!await session.OpenLocationAsync(item.Favorite?item.EntryPath:item.Path,item.Favorite))return;
            if(disposed)return;
            session.Query=item.Query;session.Filter=item.Filter;session.Recursive=item.Recursive;
            if(await session.NavigateAsync(item.Path)&&!disposed)await services.DesktopActions.RememberAsync(item);
        }catch(Exception e){if(!disposed)notice(FailureText.From(e));}
    }
    private async void RunProgram(DesktopProgram program,int layout)
    {
        if(busy||disposed)return;busy=true;
        using var request=CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);operation=request;
        var source=capsule?.AppWindow.Id??main.AppWindow.Id;
        try{
            var target=await DesktopProgramWindows.OpenAsync(program,request.Token,layout>=0);
            if(disposed)return;request.Token.ThrowIfCancellationRequested();
            if(layout>=0){
                WindowActivation.Show(main);
                if(main.AppWindow.Presenter is Microsoft.UI.Windowing.OverlappedPresenter presenter)presenter.Restore();
                var area=Microsoft.UI.Windowing.DisplayArea.GetFromWindowId(source,Microsoft.UI.Windowing.DisplayAreaFallback.Nearest).WorkArea;
                await NativeSnapSequence.PairAsync(new NativeSnapInput(area.X,area.Y,area.Width,area.Height),WinRT.Interop.WindowNative.GetWindowHandle(main),target,(SnapSide)layout,request.Token);
                notice(UiMessage.Key("ui.desktop.snapDone"));
            }
        }catch(OperationCanceledException){}catch(Exception e){if(!disposed){WindowActivation.Show(main);notice(FailureText.From(e));}}
        finally{operation=null;busy=false;}
    }
    private bool busy;
    public void Dispose(){disposed=true;lifetime.Cancel();capsule?.Close();services.DesktopActions.Changed-=Changed;services.Preferences.Changed-=Changed;toolbar.SearchSubmitted-=Remember;toolbar.SetSearchHistory(null);main.Activated-=MainActivated;lifetime.Dispose();}
}
