using System.Text.Json;
using Cap7CE.WinUI.Models;
namespace Cap7CE.WinUI.Services;
// Reuses the existing interactive Core operations and revision checks.
internal sealed class ManualKeywordService(ShellServices services)
{
    public async Task<ManualKeywords> ReadAsync(AssetItem item,CancellationToken token)
    {
        var core=services.Core??throw new IOException("Core 尚未连接");
        return Parse(await core.RequestAsync<JsonElement>("keywords.read",new{identity=Identity(item)},token));
    }
    public async Task<ManualKeywords> SaveAsync(AssetItem item,string[] words,string? revision)
    {
        FileAccessGuard.Validate(item);
        var core=services.Core??throw new IOException("Core 尚未连接");
        var reply=await core.RequestAsync<JsonElement>("keywords.write",new{identity=Identity(item),keywords=words,expectedRevision=revision});
        if(!reply.GetProperty("saved").GetBoolean())throw new IOException("关键词已在其他窗口变化，请重新读取后再编辑");
        return Parse(reply.GetProperty("current"));
    }
    private static ManualKeywords Parse(JsonElement reply)=>new(reply.GetProperty("keywords").EnumerateArray().Select(value=>value.GetString()!).ToArray(),
        reply.GetProperty("revision").ValueKind==JsonValueKind.Null?null:reply.GetProperty("revision").GetString());
    private static object Identity(AssetItem item)=>new{item.Entry.VolumeId,item.Entry.FileReference,item.Entry.CreatedFileTimeMilliseconds};
}
