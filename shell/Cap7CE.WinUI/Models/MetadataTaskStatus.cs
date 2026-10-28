using System.Text.Json;

namespace Cap7CE.WinUI.Models;

internal sealed record MetadataTaskStatus(string Phase,long Processed,long Discovered,long Failed,long Unsupported,long? Total,double? Fraction,
    string? ErrorCode,bool Owned,string Operation)
{
    public bool Running=>Owned&&Phase is not ("idle" or "completed" or "paused" or "failed");
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
