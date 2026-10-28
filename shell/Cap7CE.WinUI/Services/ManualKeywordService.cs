using Cap7CE.WinUI.Localization;
using System.Text.Json;
using Cap7CE.WinUI.Models;
namespace Cap7CE.WinUI.Services;
// Reuses the existing interactive Core operations and revision checks.
internal sealed class ManualKeywordService(ShellServices services)
{
    public async Task<ManualKeywords> ReadAsync(AssetItem item,CancellationToken token)
    {
        var core=services.Core??throw new UiFailure("ui.error.coreNotConnected");
        return Parse(await core.RequestAsync<JsonElement>("keywords.read",new{identity=Identity(item)},token));
    }
    public async Task<ManualKeywords> SaveAsync(AssetItem item,string[] words,string? revision)
    {
        FileAccessGuard.Validate(item);
        var core=services.Core??throw new UiFailure("ui.error.coreNotConnected");
        var reply=await core.RequestAsync<JsonElement>("keywords.write",new{identity=Identity(item),keywords=words,expectedRevision=revision});
        if(!reply.GetProperty("saved").GetBoolean())throw new UiFailure("ui.error.keywordReload");
        return Parse(reply.GetProperty("current"));
    }
    public async Task<bool> TrySaveAsync(AssetItem item,string[] words,string? revision)
        =>(await SaveAttemptAsync(item,words,revision)).Saved;
    public async Task<ManualKeywordSaveResult> SaveAttemptAsync(AssetItem item,string[] words,string? revision)
    {
        FileAccessGuard.Validate(item);
        var core=services.Core??throw new UiFailure("ui.error.coreNotConnected");
        var reply=await core.RequestAsync<JsonElement>("keywords.write",new{identity=Identity(item),keywords=words,expectedRevision=revision});
        return new(reply.GetProperty("saved").GetBoolean(),Parse(reply.GetProperty("current")));
    }
    private static ManualKeywords Parse(JsonElement reply)=>new(reply.GetProperty("keywords").EnumerateArray().Select(value=>value.GetString()!).ToArray(),
        reply.GetProperty("revision").ValueKind==JsonValueKind.Null?null:reply.GetProperty("revision").GetString());
    private object Identity(AssetItem item)
    {item=FileAccessGuard.ResolveIdentity(item,services.Volumes);return new{item.Entry.VolumeId,item.Entry.FileReference,item.Entry.CreatedFileTimeMilliseconds};}
}
