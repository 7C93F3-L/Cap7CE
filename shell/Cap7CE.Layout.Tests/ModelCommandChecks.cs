using System.Text.Json;
using Cap7CE.WinUI.Commands;
using Cap7CE.WinUI.Services;
internal static class ModelCommandChecks
{
    public static async Task RunAsync()
    {
        var services=new ShellServices();var actions=new ModelCommandActions(services);var changes=0;
        services.ModelChanges.Changed+=()=>changes++;
        // Exercise the actual command entry used by tray and quick commands.
        await actions.ExecuteAsync("llama:start",null);
        await actions.ExecuteAsync("llama:stop",null);
        await actions.RuntimeAsync("runtime.stop");
        await actions.RuntimeAsync("runtime.stop","fixture reason");
        await actions.RuntimeAsync("runtime.state");
        if(changes!=8||services.ModelChanges.Busy)throw new Exception("Mutations notify before/after; reads must not invalidate settings.");
        if(services.Models.Calls[^2].Value as string!="fixture reason"||services.Models.Calls[^1].Value is not null)throw new Exception("Explicit stop reason and null read payload must be preserved.");
        services.Models.Fail=true;
        try{await actions.ExecuteAsync("llama:stop",null);throw new Exception("Host failure must propagate.");}catch(IOException){}
        if(services.ModelChanges.Busy||changes!=10)throw new Exception("Failed stop must release busy and trigger settings refresh.");
        Console.WriteLine("Real model command entry: start/stop protocol payloads, read isolation and failed-stop notification passed (fixture host, no model process).");
    }
}
namespace Cap7CE.WinUI.Services
{
    internal sealed partial class ShellServices
    {
        public ModelChanges ModelChanges {get;}=new();
        public ModelCommandHostFixture Models {get;}=new();
        public object ModelContext=>new{runtimeRoot="fixture",modelsRoot="fixture",language="zh-CN"};
        public ModelAutoFixture AutoKeywords {get;}=new();
    }
    internal sealed class ModelAutoFixture {public bool Busy {get;set;}}
    internal sealed class ModelCommandHostFixture
    {
        public bool Fail {get;set;}
        public List<(string Method,object? Value)> Calls {get;}=[];
        public Task<JsonElement> RequestAsync(string method,object?[] args,CancellationToken token=default)
        {
            token.ThrowIfCancellationRequested();Calls.Add((method,args[1]));
            // Same argument contract enforced by core/node/modelRuntime/api.ts.
            if(method=="runtime.stop"&&args[1] is not string)throw new Exception("Host rejects non-string stop reasons.");
            if(method=="runtime.start"&&args[1] as string is not ("manual" or "ai"))throw new Exception("Host rejects invalid start source.");
            if(method=="runtime.state"&&args[1] is not null)throw new Exception("Host requires null for reads.");
            if(Fail)throw new IOException("fixture runtime failure");
            return Task.FromResult(JsonSerializer.SerializeToElement(new{state=new{status=method=="runtime.start"?"running":"stopped"}}));
        }
    }
}
