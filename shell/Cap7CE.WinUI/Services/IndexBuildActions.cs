using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;

// Both settings and onboarding use the same existing Core selection/build actions.
internal static class IndexBuildActions
{
    public static async Task<CatalogBuildResponse> StartAsync(ShellServices services,string[] ids,bool rebuild=false)
    {
        var core=services.Core;if(core?.IsConnected!=true)throw new UiFailure("ui.error.coreDisconnected");
        if(ids.Length==0)throw new UiFailure("ui.index.chooseVolumes");
        await core.RequestAsync<VolumeSelectionResponse>(CoreOperations.VolumeSelection,new VolumeSelectionRequest(ids));
        var reply=await core.RequestAsync<CatalogBuildResponse>(rebuild?CoreOperations.CatalogRebuild:CoreOperations.CatalogBuild,new CatalogBuildRequest(ids));
        if(reply.Accepted)services.TaskNotices.Begin("index",reply.TaskId);
        return reply;
    }
    public static async Task StartAllAsync(ShellServices services)
    {
        var core=services.Core;if(core?.IsConnected!=true)throw new UiFailure("ui.error.coreDisconnected");
        var status=await core.RequestAsync<CatalogStatusResponse>(CoreOperations.CatalogStatus,new{});
        if(!IndexOnboardingPolicy.CanOffer(status,false,false))return;
        var found=await core.RequestAsync<VolumeListResponse>(CoreOperations.VolumeList,new{},deadlineMs:30000);
        status=await core.RequestAsync<CatalogStatusResponse>(CoreOperations.CatalogStatus,new{});
        if(!IndexOnboardingPolicy.CanOffer(status,false,false))return;
        var order=services.Preferences.Current.IndexVolumeOrder;
        var ids=found.Volumes.OrderBy(v=>Array.IndexOf(order,v.VolumeId) is var index&&index>=0?index:int.MaxValue).Select(v=>v.VolumeId).ToArray();
        if(ids.Length==0)throw new UiFailure("ui.index.chooseVolumes");
        await services.Preferences.UpdateAsync(p=>{
            var selected=new Dictionary<string,bool>(p.IndexVolumeSelection);foreach(var id in ids)selected[id]=true;
            return p with{IndexVolumeSelection=selected};
        });
        await StartAsync(services,ids);await services.RefreshVolumesAsync();
    }
}
