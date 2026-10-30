using System.Text.Json;

namespace Cap7CE.WinUI.Models;

internal sealed record MetadataPanelState(MetadataTaskStatus Progress,string? Directory,int Pending,bool HasPolicy)
{
    public bool CanPause=>Progress.Phase is "preparing" or "discovering" or "waiting" or "extracting";
    public bool CanResume=>Progress.Phase=="paused"&&(Pending>0||HasPolicy)||Progress.Phase=="failed"&&Pending>0;
    public bool CanCancel=>Pending>0||HasPolicy&&(CanPause||CanResume||Progress.Phase is "pausing" or "failed");
    public bool ShowTaskArea=>CanPause||CanResume||CanCancel||Progress.Phase is "pausing" or "failed";
    public bool ShowProgress=>CanPause||Progress.Phase=="pausing"||Progress.Phase=="paused"&&(Pending>0||HasPolicy);
    public bool ShowCounts=>Progress.Phase!="idle"&&(Progress.Phase!="paused"||Pending>0||HasPolicy)
        &&(Progress.Discovered>0||Progress.Processed>0||Progress.Failed>0||Progress.Unsupported>0||Progress.Total is not null);
    public static MetadataPanelState Read(JsonElement result)
    {
        string? directory=null;var pending=0;
        if(result.TryGetProperty("directoryTask",out var task)&&task.ValueKind==JsonValueKind.Object) {
            if(task.TryGetProperty("path",out var path)&&path.ValueKind==JsonValueKind.String)directory=path.GetString();
            if(task.TryGetProperty("pending",out var count)&&count.ValueKind==JsonValueKind.Number&&count.TryGetInt32(out var value))pending=Math.Max(0,value);
        }
        var hasPolicy=result.TryGetProperty("policy",out var policy)&&policy.ValueKind==JsonValueKind.Object
            &&policy.TryGetProperty("includes",out var includes)&&includes.ValueKind==JsonValueKind.Array&&includes.GetArrayLength()>0;
        return new(MetadataTaskStatus.Read(result,false,"status"),directory,pending,hasPolicy);
    }
}
