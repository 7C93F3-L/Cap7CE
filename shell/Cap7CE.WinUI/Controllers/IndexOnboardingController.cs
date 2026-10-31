using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Views;
using Microsoft.UI.Xaml;
using Microsoft.UI.Windowing;

namespace Cap7CE.WinUI.Controllers;

internal sealed class IndexOnboardingController : IDisposable
{
    private readonly Window window;
    private readonly ShellServices services;
    private readonly Func<XamlRoot> root;
    private readonly Action customize;
    private readonly Action<UiMessage> notice;
    private readonly Func<bool> canPrompt;
    private CoreConnection? checkedOwner;
    private IndexOnboardingDialog? dialog;
    private bool started,active,busy,shown,disposed,remembering,history;
    public IndexOnboardingController(Window window,ShellServices services,Func<XamlRoot> root,Action customize,Action<UiMessage> notice,Func<bool> canPrompt)
    {
        this.window=window;this.services=services;this.root=root;this.customize=customize;this.notice=notice;this.canPrompt=canPrompt;
        window.Activated+=Activated;services.ConnectionChanged+=Schedule;services.IndexStatusChanged+=Snapshot;
    }
    public void Start(){started=true;Schedule();}
    private void Activated(object sender,WindowActivatedEventArgs e){active=e.WindowActivationState!=WindowActivationState.Deactivated;if(active)Schedule();}
    private bool Visible=>active&&canPrompt()&&window.AppWindow.IsVisible&&window.AppWindow.Presenter is OverlappedPresenter {State:not OverlappedPresenterState.Minimized};
    private void Schedule()=>window.DispatcherQueue.TryEnqueue(async()=>{if(!disposed)await OfferAsync();});
    private void Snapshot(CatalogStatusResponse status)=>window.DispatcherQueue.TryEnqueue(async()=>{
        if(disposed||!started||services.Core?.Supports(CoreOperations.VolumeList)!=true)return;
        await RememberAsync(status);if(!Eligible(status))dialog?.Hide();Schedule();
    });
    private async Task RememberAsync(CatalogStatusResponse status)
    {
        history|=IndexOnboardingPolicy.HasIndexHistory(status);
        if(!history||remembering||services.Preferences.Current.IndexSetupCompleted)return;
        remembering=true;
        try{await services.Preferences.UpdateAsync(p=>p with{IndexSetupCompleted=true});}
        catch(Exception error){NativeDiagnostics.CoreFailure(error.ToString());}
        finally{remembering=false;}
    }
    private bool Eligible(CatalogStatusResponse status)=>IndexOnboardingPolicy.CanOffer(status,
        history||services.Preferences.Current.IndexSetupCompleted,services.Preferences.Current.DismissIndexSetupPrompt);
    private async Task OfferAsync()
    {
        if(history||services.Preferences.Current.IndexSetupCompleted||services.Preferences.Current.DismissIndexSetupPrompt)return;
        if(!started||busy||shown||!Visible||services.Core is not {IsConnected:true} core||ReferenceEquals(core,checkedOwner))return;
        if(!core.Supports(CoreOperations.VolumeList))return;
        busy=true;checkedOwner=core;
        try {
            var status=await core.RequestAsync<CatalogStatusResponse>(CoreOperations.CatalogStatus,new{});
            await RememberAsync(status);if(disposed||!Eligible(status))return;
            var found=await core.RequestAsync<VolumeListResponse>(CoreOperations.VolumeList,new{},deadlineMs:30000);
            status=await core.RequestAsync<CatalogStatusResponse>(CoreOperations.CatalogStatus,new{});
            await RememberAsync(status);
            if(disposed||!ReferenceEquals(core,services.Core)||!Eligible(status)||found.Volumes.Count==0)return;
            if(!Visible||root() is null){checkedOwner=null;return;}
            dialog=new(root(),async()=>{
                try{await services.Preferences.UpdateAsync(p=>p with{DismissIndexSetupPrompt=true});}
                catch(Exception error){NativeDiagnostics.CoreFailure(error.ToString());throw;}
            });
            shown=true;
            IndexOnboardingChoice choice;
            try{choice=await dialog.ShowAsync();}catch{shown=false;checkedOwner=null;throw;}
            if(disposed)return;
            if(choice==IndexOnboardingChoice.Custom)customize();
            else if(choice==IndexOnboardingChoice.Start)await IndexBuildActions.StartAllAsync(services);
        }catch(Exception error){if(!disposed){NativeDiagnostics.CoreFailure(error.ToString());if(shown)notice(FailureText.From(error));}}
        finally{dialog=null;busy=false;}
    }
    public void Dispose()
    {
        disposed=true;window.Activated-=Activated;services.ConnectionChanged-=Schedule;services.IndexStatusChanged-=Snapshot;dialog?.Hide();
    }
}
