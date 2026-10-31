using Cap7CE.Core.Protocol;

namespace Cap7CE.WinUI.Models;

internal static class IndexOnboardingPolicy
{
    public static bool HasIndexHistory(CatalogStatusResponse status)=>status.Volumes.Any(v=>v.Queryable||v.State=="ready"||v.Processed>0)
        ||status.Tasks.Any(t=>t.State=="completed"&&t.Kind is "build" or "rebuild" or "initial" or "synchronize");
    public static bool CanOffer(CatalogStatusResponse status,bool completed,bool dismissed)=>!completed&&!dismissed
        &&!HasIndexHistory(status)&&status.Tasks.All(t=>t.State is "completed" or "failed" or "cancelled")
        &&status.Volumes.All(v=>v.State=="disabled");
}
