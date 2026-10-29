using System.Text.Json;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Localization;

namespace Cap7CE.WinUI.Commands;
internal sealed class ModelCommandActions(ShellServices services)
{
    public Task<JsonElement> SettingsAsync(string operation,string? value=null)=>services.Models.RequestAsync("modelSettings.invoke",[services.ModelContext,operation,value]);
    public async Task<JsonElement> RuntimeAsync(string operation,object? value=null)=>(await services.Models.RequestAsync(operation,[services.ModelContext,value])).GetProperty("state");
    public async Task ExecuteAsync(string id,string? name)
    {
        var runtime=id.StartsWith("llama:");var action=id.Split(':')[1];
        if(action=="refresh"){await SettingsAsync(runtime?"runtime.settings":"models.settings");return;}
        if(action is "start" or "stop"){
            if(action=="stop"&&services.AutoKeywords.Busy)throw new UiFailure("ui.error.autoBusy");
            var state=await RuntimeAsync("runtime."+action,action=="start"?"manual":null);
            if(state.GetProperty("status").GetString()!=(action=="start"?"running":"stopped"))throw new UiFailure("ui.command.runtimeFailed");
            return;
        }
        var status=await RuntimeAsync("runtime.state");
        if(status.GetProperty("status").GetString() is "starting" or "running")throw new UiFailure("ui.command.stopBeforeSelect");
        var settings=await SettingsAsync(runtime?"runtime.settings":"models.settings");
        var matches=settings.GetProperty(runtime?"versions":"models").EnumerateArray().Where(item=>
            string.Equals(item.GetProperty(runtime?"version":"id").GetString(),name,StringComparison.OrdinalIgnoreCase)
            ||!runtime&&string.Equals(item.GetProperty("name").GetString(),name,StringComparison.OrdinalIgnoreCase)).ToArray();
        if(matches.Length!=1)throw new UiFailure("ui.command.uniqueMatch");
        var key=matches[0].GetProperty(runtime?"version":"id").GetString()!;
        if(!runtime&&matches[0].TryGetProperty("loadable",out var loadable)&&!loadable.GetBoolean())throw new UiFailure("ui.command.uniqueMatch");
        var result=await SettingsAsync(runtime?"runtime.select":"models.select",key);
        if(result.TryGetProperty(runtime?"selectedVersion":"selectedModelId",out var selected)&&selected.GetString()!=key)throw new UiFailure("ui.command.runtimeFailed");
    }
}
