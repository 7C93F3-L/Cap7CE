using Cap7CE.WinUI.Models;
using System.Text.Json;

internal static class MetadataExclusionChecks
{
    public static async Task RunAsync()
    {
        void Require(bool value,string message){if(!value)throw new Exception(message);}
        var defaults=MetadataExclusions.Defaults(new Dictionary<string,bool>());
        Require(defaults.Length==5&&defaults.All(item=>item.Enabled),"All five default exclusions start checked");
        var uncheckedDefaults=MetadataExclusions.Defaults(defaults.ToDictionary(item=>item.Key,_=>false));
        Require(uncheckedDefaults.All(item=>!item.Enabled),"An explicit empty exclusion choice survives default initialization");
        MetadataBatchVolume[] volumes=[new("c","C:"),new("d","D:")];
        MetadataExclusion[] choices=[new("one","system","C:\\Windows",true,true),new("duplicate","same","c:\\windows",true,false),
            new("disabled","off","C:\\Data",false,false),new("outside","outside","E:\\Other",true,false)];
        var calls=new List<string>();
        Task<MetadataBatchScope> Resolve(string path,CancellationToken token){token.ThrowIfCancellationRequested();calls.Add(path);return Task.FromResult(new MetadataBatchScope("c","root"));}
        var plan=await MetadataExclusions.BuildAsync(volumes,choices,Resolve);
        Require(plan.VolumeOrder.SequenceEqual(new[]{"c","d"})&&plan.Includes.Length==2&&plan.Includes.All(scope=>scope.RootFileReference is null),"Batch scope covers only the explicit target volumes");
        Require(plan.Excludes is [{VolumeId:"c",RootFileReference:"root"}]&&calls.Count==2,"Disabled/outside paths never resolve and duplicate identities collapse");
        var body=JsonSerializer.SerializeToElement(new{policy=plan,allowMetadataExtraction=true},new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Require(body.GetProperty("policy").GetProperty("excludes")[0].GetProperty("rootFileReference").GetString()=="root","Existing Core policy contract uses stable identities");
        var noExclusions=await MetadataExclusions.BuildAsync(volumes,choices.Select(item=>item with{Enabled=false}).ToArray(),Resolve);
        Require(noExclusions.Excludes.Length==0&&noExclusions.Includes.Length==2,"Unchecking all exclusions retains explicit volume scope");
        try{await MetadataExclusions.BuildAsync(volumes,choices,(_,_)=>throw new IOException("unresolved"));throw new Exception("Expected fail closed");}catch(IOException e)when(e.Message=="unresolved"){}
        try{await MetadataExclusions.BuildAsync(volumes,choices,(_,_)=>Task.FromResult(new MetadataBatchScope("foreign","root")));throw new Exception("Expected foreign volume rejection");}catch(IOException){}
        using var abort=new CancellationTokenSource();abort.Cancel();var before=calls.Count;
        try{await MetadataExclusions.BuildAsync(volumes,choices,Resolve,abort.Token);throw new Exception("Expected cancellation");}catch(OperationCanceledException){}
        Require(calls.Count==before,"Cancellation stops scope resolution before dispatch");
        try{await MetadataExclusions.BuildAsync([],choices,Resolve);throw new Exception("Expected empty scope rejection");}catch(IOException){}
        Console.WriteLine("Metadata exclusion checks passed: five checked defaults, persisted deselection, explicit volume scope, identity deduplication, fail-closed resolution and cancellation.");
    }
}
