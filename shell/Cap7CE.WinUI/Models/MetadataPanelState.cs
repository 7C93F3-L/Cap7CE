using System.Text.Json;

namespace Cap7CE.WinUI.Models;

internal sealed record MetadataPanelState(MetadataTaskStatus Progress,string? Directory,int Pending,bool HasPolicy)
{
    public bool CanPause=>Progress.Phase is "preparing" or "discovering" or "waiting" or "extracting";
    public bool CanResume=>Progress.Phase=="paused"&&(Pending>0||HasPolicy)||Progress.Phase=="failed"&&Pending>0;
    public bool CanCancel=>Pending>0;
    public bool ShowTaskArea=>CanPause||CanResume||CanCancel||Progress.Phase is "pausing" or "failed";
    public string ControlText=>Progress.Phase=="failed"?"重试":Progress.Phase=="paused"?"继续":"暂停";
    public bool ShowProgress=>CanPause||Progress.Phase=="pausing"||Progress.Phase=="paused"&&(Pending>0||HasPolicy);
    public bool ShowCounts=>Progress.Phase!="idle"&&(Progress.Phase!="paused"||Pending>0||HasPolicy)
        &&(Progress.Discovered>0||Progress.Processed>0||Progress.Failed>0||Progress.Unsupported>0||Progress.Total is not null);
    public static string DescribeError(string code)=>code switch {
        "metadata-directory-unavailable"=>"目标目录的索引尚不可用，请先检查目录索引。",
        "metadata-directory-changed"=>"目标目录已变化，请重新选择目录。",
        "metadata-directory-state-unavailable" or "metadata-build-preferences-unavailable"=>"无法保存任务状态，请检查磁盘空间和目录权限。",
        "metadata-build-not-paused"=>"当前没有可继续的已暂停任务，请刷新状态。",
        "metadata-directory-queue-full"=>"目录队列已满，请等待现有任务完成后再添加。",
        "metadata-directory-failed" or "metadata-build-failed"=>"元数据提取未完成，请查看任务结果或重试。",
        _=>code.StartsWith("metadata-",StringComparison.Ordinal)?"元数据操作未完成，请刷新状态或查看诊断信息。":code
    };
    public string Title=>Progress.Phase switch {
        "idle"=>"暂无提取任务",
        "preparing"=>"正在准备",
        "discovering"=>"正在发现文件属性任务",
        "waiting"=>"正在等待索引或可用任务",
        "extracting"=>"正在提取元数据",
        "pausing"=>"正在暂停…",
        "paused"=>Pending>0||HasPolicy?"已暂停":"暂无提取任务",
        "completed"=>"提取完成",
        "failed"=>"提取失败",
        _=>"正在读取任务状态"
    };
    public string Counts=>Progress.Phase=="discovering"?$"已发现 {Progress.Discovered:N0} 项属性任务":
        (Progress.Total is {} total?$"已处理 {Progress.Processed:N0} / {total:N0} 项属性任务":$"已处理 {Progress.Processed:N0} 项属性任务")
        +(Progress.Failed>0?$" · 失败 {Progress.Failed:N0}":"")+(Progress.Unsupported>0?$" · 不支持 {Progress.Unsupported:N0}":"");
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
