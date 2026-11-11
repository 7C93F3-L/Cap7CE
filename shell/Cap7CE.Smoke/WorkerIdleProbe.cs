using Cap7CE.WinUI.Services;
internal static class WorkerIdleProbe
{
    public static async Task RunAsync(string root)
    {
        var data=Path.Combine(Path.GetTempPath(),"cap7ce-idle-probe-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(data);
        try{
            await using var host=new CoreNodeHost(root,"visual-cache.cjs",data);
            await using var metadata=new CoreNodeHost(root,"visual-cache.cjs",Path.Combine(data,"metadata"));
            var image=Path.Combine(root,"build","notification-icon.png");
            var prepared=await host.RequestAsync("ensure",[image,"skim-thumbnail"]);
            if(!File.Exists(prepared.GetProperty("imagePath").GetString()))throw new Exception("thumbnail missing");
            await metadata.RequestAsync("previewMetadata",[Guid.NewGuid().ToString(),image]);
            await Task.WhenAll(host.RequestAsync("stats",[]),host.RequestAsync("skimStats",[]));
            if(!host.IsActive)throw new Exception("host did not start");
            Console.WriteLine("worker active; waiting for idle retirement");
            await Task.Delay(TimeSpan.FromSeconds(68));
            if(host.IsActive||metadata.IsActive)throw new Exception("idle host retained");
            await host.RequestAsync("stats",[]);if(!host.IsActive)throw new Exception("host did not restart");
            await metadata.RequestAsync("previewMetadata",[Guid.NewGuid().ToString(),image]);
            if(!metadata.IsActive)throw new Exception("metadata did not restart");
            var restored=await host.RequestAsync("ensure",[image,"skim-thumbnail"]);
            if(!File.Exists(restored.GetProperty("imagePath").GetString()))throw new Exception("cache lost on restart");
            Console.WriteLine("thumbnail and metadata idle retirement, restart and cache reuse passed");
        }finally{Directory.Delete(data,true);}
    }
}
