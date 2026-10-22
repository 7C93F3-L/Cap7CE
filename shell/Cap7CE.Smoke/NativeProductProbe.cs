using Cap7CE.WinUI.Services;
using Cap7CE.Core.Protocol;
using System.Diagnostics;
using System.Text.Json;
using Microsoft.Data.Sqlite;

internal static class NativeProductProbe
{
    internal static async Task RunAsync(string root)
    {
        var token=Guid.NewGuid().ToString("N");var pipe="cap7ce-core-p32-"+token;
        var temporary=Path.GetFullPath(Path.Combine(Path.GetTempPath(),"Cap7CE-Core-P32-"+token));
        if(!temporary.StartsWith(Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new IOException("Invalid probe root");
        var profile=CoreLaunchProfile.Create(root,"",true,false);
        profile.Start.ArgumentList.Clear();foreach(var arg in new[]{"--catalog-controller-probe","--pipe-name",pipe})profile.Start.ArgumentList.Add(arg);
        try {
            await using var core=await CoreConnection.StartAsync(profile with{Pipe=pipe});
            if(!core.Supports(MetadataBuildOperations.Attach))throw new IOException("Product metadata capability missing");
            var before=await core.RequestAsync<CatalogStatusResponse>(CoreOperations.CatalogStatus,new{});
            var attached=await core.RequestAsync<JsonElement>(MetadataBuildOperations.Attach,new{});
            if(attached.TryGetProperty("errorCode",out var attachError)&&attachError.ValueKind==JsonValueKind.String)throw new IOException(attached.ToString());
            var state=await core.RequestAsync<JsonElement>(MetadataBuildOperations.Status,new{});
            if(state.TryGetProperty("errorCode",out var stateError)&&stateError.ValueKind==JsonValueKind.String)throw new IOException(state.ToString());
            var phase=state.GetProperty("result").GetProperty("progress").GetProperty("phase").GetString();
            if(phase!="idle")throw new IOException("Probe unexpectedly started extraction: "+phase);
            var after=await core.RequestAsync<CatalogStatusResponse>(CoreOperations.CatalogStatus,new{});
            if(after.CatalogRevision!=before.CatalogRevision||after.Tasks.Count!=0||after.Volumes.Count!=0)throw new IOException("Read-only task observation mutated Catalog");
            Console.WriteLine("passed: product-host ready/identity/handshake, metadata attach/status, no extraction or Reader discovery, isolated temporary Catalog");
        } finally{SqliteConnection.ClearAllPools();if(Directory.Exists(temporary))Directory.Delete(temporary,true);}
    }
}
