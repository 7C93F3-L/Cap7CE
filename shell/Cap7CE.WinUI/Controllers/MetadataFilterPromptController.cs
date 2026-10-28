using Cap7CE.Core.Protocol;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Controls.Filters;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controllers;

internal sealed class MetadataFilterPromptController(ShellServices services,Func<BrowseSession?> active,Func<XamlRoot> root,Action<UiMessage> notice) : IDisposable
{
    private bool busy,disposed;
    public async void Request(string kind,bool colors,FilterAvailabilityState state)
    {
        if(busy||disposed)return;
        if(state==FilterAvailabilityState.Checking){notice(UiMessage.Key("ui.metadataPrompt.checking"));return;}
        if(state!=FilterAvailabilityState.Missing){notice(UiMessage.Key("ui.metadataPrompt.checkFailed"));return;}
        if(active() is not {} session)return;
        var path=session.PathValue;var selected=FilterPresets.QueryExtensions(session.Filter);var hidden=session.ShowHidden;
        bool Current()=>!disposed&&ReferenceEquals(active(),session)&&session.PathValue==path&&session.ShowHidden==hidden
            &&FilterPresets.QueryExtensions(session.Filter).SequenceEqual(selected,StringComparer.OrdinalIgnoreCase);
        busy=true;
        try {
            var core=services.Core;
            if(core?.IsConnected!=true||!core.Supports(MetadataBuildOperations.Attach))throw new UiFailure("ui.error.metadataService");
            var volumes=services.Volumes.Where(volume=>volume.Selected&&volume.Queryable).Select(volume=>volume.VolumeId).ToArray();
            if(volumes.Length==0)throw new UiFailure("ui.error.metadataIndex");
            CoreSearchScopeRequest? scope=null;
            if(path.Length>0) {
                var resolved=await core.RequestAsync<CatalogResolveScopeResponse>(CoreOperations.CatalogResolveScope,new CatalogResolveScopeRequest(path));
                if(!resolved.Resolved||!resolved.Queryable||resolved.VolumeId is null||resolved.DirectoryFileReference is null)throw new UiFailure("ui.error.metadataScope");
                scope=new("directory-descendants",resolved.VolumeId,resolved.DirectoryFileReference);
            }
            var supported=FormatRegistry.ExtractorExtensions(kind);
            if(selected.Length>0)supported=supported.Intersect(selected,StringComparer.OrdinalIgnoreCase).ToArray();
            if(supported.Length==0){notice(UiMessage.Key("ui.metadataPrompt.unsupported"));return;}
            var candidates=await core.RequestAsync<SearchPageResponse>(CoreOperations.SearchStart,new SearchStartRequest("",1,"name-ascending",
                scope is null?volumes:[scope.VolumeId!],scope,EntryType:"file",FileConditions:new(supported),ExcludeHidden:!hidden,IncludeTotalCount:false));
            if(!Current()||!ReferenceEquals(core,services.Core))return;
            if(candidates.Items.Count==0){notice(UiMessage.Key("ui.metadataPrompt.empty"));return;}
            var picker=new MetadataRangePicker(path.Length>0);
            var dialog=L.Dialog(root(),"ui.metadataPrompt.title",null,"ui.metadataPrompt.start");dialog.DefaultButton=ContentDialogButton.Primary;
            var customRequested=false;
            picker.CustomRequested+=()=>{customRequested=true;dialog.Hide();};
            var content=Ui.Column(L.Text("ui.metadataPrompt.choose"));
            if(path.Length>0)content.Children.Add(Ui.Text(path,true));
            content.Children.Add(picker);dialog.Content=content;
            var result=await dialog.ShowAsync();
            if(!Current()||!ReferenceEquals(core,services.Core))return;
            if(customRequested||result==ContentDialogResult.Primary&&picker.Choice==MetadataRangeChoice.Custom){services.ShowMaintenance();return;}
            if(result!=ContentDialogResult.Primary)return;
            if(picker.Choice==MetadataRangeChoice.Recommended) {
                await MetadataBatchService.StartAsync(services,MetadataExclusions.Defaults(new Dictionary<string,bool>()));
            } else if(picker.Choice==MetadataRangeChoice.Current) {
                FileAccessGuard.RejectLinks(path);if(!Directory.Exists(path))throw new UiDirectoryFailure("ui.error.directoryMissing");
                await services.Metadata.InvokeAsync("startDirectory",new{path,allowMetadataExtraction=true});
            } else await services.Metadata.InvokeAsync("startAllVolumes",new{allowMetadataExtraction=true});
        }catch(Exception error){if(!disposed)notice(FailureText.From(error));}
        finally{busy=false;}
    }
    public void Dispose()=>disposed=true;
}
