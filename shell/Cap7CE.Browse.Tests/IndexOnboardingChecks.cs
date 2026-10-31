using System.Text.Json;
using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;

internal static class IndexOnboardingChecks
{
    public static async Task RunAsync()
    {
        static void Check(bool value,string message){if(!value)throw new Exception(message);}
        static CoreVolumeStatus Volume(string id="c",string state="disabled",long count=0,bool queryable=false)=>new(id,id+":","NTFS",false,state,count,null,queryable,state=="needsRebuild");
        var fresh=new CatalogStatusResponse([Volume()],[],0);
        Check(IndexOnboardingPolicy.CanOffer(fresh,false,false),"fresh unbuilt volumes offer setup");
        Check(!IndexOnboardingPolicy.CanOffer(fresh,true,false)&&!IndexOnboardingPolicy.CanOffer(fresh,false,true),"saved completion and opt-out suppress setup");
        foreach(var state in new[]{"running","pending","queued","cancelling","unknown"})
            Check(!IndexOnboardingPolicy.CanOffer(fresh with{Tasks=[new("task","build",state,null)]},false,false),"active or uncertain tasks suppress setup");
        foreach(var state in new[]{"building","discovering","needsRebuild","unavailable","unknown"})
            Check(!IndexOnboardingPolicy.CanOffer(fresh with{Volumes=[Volume(state:state)]},false,false),"abnormal volume state must not masquerade as first use");
        Check(IndexOnboardingPolicy.HasIndexHistory(fresh with{Volumes=[Volume(state:"ready")]}),"even an empty successful index is remembered");
        Check(IndexOnboardingPolicy.HasIndexHistory(fresh with{Volumes=[Volume(state:"unavailable",count:5)]}),"published index history survives offline state");
        Check(IndexOnboardingPolicy.HasIndexHistory(fresh with{Tasks=[new("task","initial","completed",null)]}),"completed build history is remembered");
        var saved=new ShellPreferences{IndexSetupCompleted=true,DismissIndexSetupPrompt=true,Language="en-US",IndexVolumeSelection=new(){{"c",false}}};
        var restored=JsonSerializer.Deserialize<ShellPreferences>(JsonSerializer.Serialize(saved))!;
        Check(restored.IndexSetupCompleted&&restored.DismissIndexSetupPrompt&&!restored.IndexVolumeSelection["c"]&&restored.Language=="en-US","prompt flags persist without discarding existing choices");
        var service=new ShellServices{Core=new(){IndexStatus=fresh,IndexVolumes=[Volume("c"),Volume("d")]}};
        service.Preferences.Current=service.Preferences.Current with{IndexVolumeOrder=["d","c"],IndexVolumeSelection=new(){{"d",false}}};
        await IndexBuildActions.StartAllAsync(service);
        var selection=(VolumeSelectionRequest)service.Core.Requests.Single(r=>r.Operation==CoreOperations.VolumeSelection).Body;
        Check(selection.VolumeIds.SequenceEqual(new[]{"d","c"}),"start now selects all discovered drives in existing priority order");
        Check(service.TaskNotices.Started.Count==1&&service.Preferences.Current.IndexVolumeSelection["d"],"start now uses existing build notification and saves the explicit full scope");
        var racing=new ShellServices{Core=new(){IndexVolumes=[Volume()]}};
        racing.Core.IndexSnapshots.Enqueue(fresh);
        racing.Core.IndexSnapshots.Enqueue(fresh with{Tasks=[new("other","build","running",null)]});
        await IndexBuildActions.StartAllAsync(racing);
        Check(!racing.Core.Requests.Any(r=>r.Operation is CoreOperations.CatalogBuild or CoreOperations.VolumeSelection),"recheck prevents starting another build after the dialog choice");
        Console.WriteLine("Index onboarding checks passed: first use, persistent opt-out/history, abnormal-state suppression, full-drive action and task recheck. Fixtures only.");
    }
}
