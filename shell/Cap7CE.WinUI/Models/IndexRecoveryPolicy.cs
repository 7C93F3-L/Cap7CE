using Cap7CE.Core.Protocol;
namespace Cap7CE.WinUI.Models;
internal sealed record IndexRecoveryIssue(string Kind,string[] VolumeIds,string Drives,bool CanRetry)
{
    public string Key=>Kind+":"+string.Join("|",VolumeIds);
}
// Presentation policy only. No polling, retries, build control or storage access.
internal static class IndexRecoveryPolicy
{
    public static IndexRecoveryIssue? Evaluate(CatalogStatusResponse status,string? maintenance)
    {
        var selected=status.Volumes.Where(v=>v.Selected).ToArray();
        if(selected.Length==0||maintenance is "starting" or "paused"||status.Preparation is not null
            ||status.Tasks.Any(t=>t.State=="running"))return null;
        if(maintenance is not ("failed" or "unavailable")&&selected.Any(v=>v.State is "building" or "catchingUp"))return null;
        var stale=selected.Where(v=>v.NeedsRebuild).ToArray();
        var kind=maintenance is "failed" or "unavailable"?maintenance:stale.Length>0?"incomplete":null;
        if(kind is null)return null;
        var affected=stale.Length>0?stale:selected;
        var ordered=affected.OrderBy(v=>v.VolumeId,StringComparer.Ordinal).ToArray();
        return new(kind,ordered.Select(v=>v.VolumeId).ToArray(),string.Join(", ",ordered.Select(v=>v.DisplayName.TrimEnd('\\','/'))),kind!="unavailable");
    }
}
