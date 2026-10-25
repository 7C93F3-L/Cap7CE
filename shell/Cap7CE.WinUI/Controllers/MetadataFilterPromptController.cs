using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Controls.Filters;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controllers;

internal sealed class MetadataFilterPromptController(ShellServices services,Func<BrowseSession?> active,Func<XamlRoot> root,Action<string> notice) : IDisposable
{
    private bool busy,disposed;
    public async void Request(string kind,bool colors,FilterAvailabilityState state)
    {
        if(busy||disposed)return;
        if(state==FilterAvailabilityState.Checking){notice("正在检查此范围的元数据，请稍候。");return;}
        if(state!=FilterAvailabilityState.Missing){notice("暂时无法检查元数据，请确认后台连接与目录索引是否就绪。");return;}
        if(active() is not {} session)return;
        var path=session.PathValue;var selected=FilterPresets.QueryExtensions(session.Filter);var hidden=session.ShowHidden;
        bool Current()=>!disposed&&ReferenceEquals(active(),session)&&session.PathValue==path&&session.ShowHidden==hidden
            &&FilterPresets.QueryExtensions(session.Filter).SequenceEqual(selected,StringComparer.OrdinalIgnoreCase);
        busy=true;
        try {
            var core=services.Core;
            if(core?.IsConnected!=true||!core.Supports(MetadataBuildOperations.Attach))throw new IOException("元数据服务未连接，请到“诊断 → 服务维护”中重新连接。");
            var volumes=services.Volumes.Where(volume=>volume.Selected&&volume.Queryable).Select(volume=>volume.VolumeId).ToArray();
            if(volumes.Length==0)throw new IOException("请先建立可用的目录索引，再提取元数据。");
            CoreSearchScopeRequest? scope=null;
            if(path.Length>0) {
                var resolved=await core.RequestAsync<CatalogResolveScopeResponse>(CoreOperations.CatalogResolveScope,new CatalogResolveScopeRequest(path));
                if(!resolved.Resolved||!resolved.Queryable||resolved.VolumeId is null||resolved.DirectoryFileReference is null)throw new IOException("当前目录索引尚未就绪，请先在设置中建立或更新索引。");
                scope=new("directory-descendants",resolved.VolumeId,resolved.DirectoryFileReference);
            }
            var supported=FormatRegistry.ExtractorExtensions(kind);
            if(selected.Length>0)supported=supported.Intersect(selected,StringComparer.OrdinalIgnoreCase).ToArray();
            if(supported.Length==0){notice("当前文件类型暂不支持这类元数据提取。");return;}
            var candidates=await core.RequestAsync<SearchPageResponse>(CoreOperations.SearchStart,new SearchStartRequest("",1,"name-ascending",
                scope is null?volumes:[scope.VolumeId!],scope,EntryType:"file",FileConditions:new(supported),ExcludeHidden:!hidden,IncludeTotalCount:false));
            if(!Current()||!ReferenceEquals(core,services.Core))return;
            if(candidates.Items.Count==0){notice("当前范围没有支持此条件的文件，无需开始提取。");return;}
            var picker=new MetadataRangePicker(path.Length>0);
            var dialog=new ContentDialog {XamlRoot=root(),Title="提取文件元数据",PrimaryButtonText="开始",CloseButtonText="取消",DefaultButton=ContentDialogButton.Primary};
            var customRequested=false;
            picker.CustomRequested+=()=>{customRequested=true;dialog.Hide();};
            var content=Ui.Column(Ui.Text("选择提取范围："));
            if(path.Length>0)content.Children.Add(Ui.Text(path,true));
            content.Children.Add(picker);dialog.Content=content;
            var result=await dialog.ShowAsync();
            if(!Current()||!ReferenceEquals(core,services.Core))return;
            if(customRequested||result==ContentDialogResult.Primary&&picker.Choice==MetadataRangeChoice.Custom){services.ShowMaintenance();return;}
            if(result!=ContentDialogResult.Primary)return;
            if(picker.Choice==MetadataRangeChoice.Recommended) {
                await MetadataBatchService.StartAsync(services,MetadataExclusions.Defaults(new Dictionary<string,bool>()));
            } else if(picker.Choice==MetadataRangeChoice.Current) {
                FileAccessGuard.RejectLinks(path);if(!Directory.Exists(path))throw new IOException("目录不存在或当前不可用。");
                await services.Metadata.InvokeAsync("startDirectory",new{path,allowMetadataExtraction=true});
            } else await services.Metadata.InvokeAsync("startAllVolumes",new{allowMetadataExtraction=true});
        }catch(Exception error){if(!disposed)notice(MetadataPanelState.DescribeError(error.Message));}
        finally{busy=false;}
    }
    public void Dispose()=>disposed=true;
}
