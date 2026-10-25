using System.Text.Json;

namespace Cap7CE.WinUI.Models;

internal sealed record MetadataTaskStatus(string Phase,long Processed,long Discovered,long Failed,long Unsupported,long? Total,double? Fraction,
    string? ErrorCode,bool Owned,string Operation)
{
    public bool Running=>Owned&&Phase is not ("idle" or "completed" or "paused" or "failed");
    public string Text=>Phase switch {
        "preparing"=>"正在准备元数据提取…",
        "discovering"=>$"正在发现元数据任务… {Discovered:N0} 项",
        "waiting"=>"正在等待索引或可用的元数据任务…",
        "pausing"=>"正在暂停元数据提取…",
        _=>"正在提取元数据… "+(Total is >0?$"{Processed:N0} / {Total:N0}":$"已处理 {Processed:N0} 项")
    };
    public string Finished=>Operation=="cancelDirectories"?"元数据目录队列已取消。":Phase switch {
        "paused"=>"元数据提取已暂停。",
        "failed"=>"元数据提取失败"+(ErrorCode is null?"。":"："+ErrorCode),
        "completed"=>"元数据提取完成。"+(Failed>0?$" {Failed:N0} 个文件失败。":"")+(Unsupported>0?$" {Unsupported:N0} 个文件不支持。":""),
        _=>"元数据提取已停止。"
    };
    public static MetadataTaskStatus Read(JsonElement result,bool owned,string operation)
    {
        var p=result.GetProperty("progress");
        long Count(string name)=>p.TryGetProperty(name,out var value)&&value.ValueKind==JsonValueKind.Number&&value.TryGetInt64(out var count)?Math.Max(0,count):0;
        var total=p.TryGetProperty("total",out var t)&&t.ValueKind==JsonValueKind.Number&&t.TryGetInt64(out var n)&&n>=0?(long?)n:null;
        double? fraction=p.TryGetProperty("progressFraction",out var f)&&f.ValueKind==JsonValueKind.Number&&f.TryGetDouble(out var v)&&double.IsFinite(v)?Math.Clamp(v,0,1):null;
        var error=p.TryGetProperty("errorCode",out var e)&&e.ValueKind==JsonValueKind.String?e.GetString():null;
        return new(p.GetProperty("phase").GetString()??"idle",Count("processed"),Count("discovered"),Count("failed"),Count("unsupported"),total,fraction,error,owned,operation);
    }
}
