using Cap7CE.WinUI.Services;
internal static class WorkerIdleProbe
{
    public static async Task RunAsync(string root)
    {
        var data=Path.Combine(Path.GetTempPath(),"cap7ce-idle-probe-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(data);
        try{
            await using var host=new CoreNodeHost(root,"visual-cache.cjs",data);
            await using var metadata=new CoreNodeHost(root,"visual-cache.cjs",Path.Combine(data,"metadata"));
            await using var office=new CoreNodeHost(root,"office-preview.cjs",Path.Combine(data,"office"));
            var officeStats=await office.RequestAsync("cache.stats",[]);
            if(!office.IsActive)throw new Exception("office stats host did not start");
            var officeCache=Path.GetFullPath(officeStats.GetProperty("cachePaths")[0].GetString()!);
            if(!officeCache.StartsWith(data+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("office fixture escaped temporary root");
            Directory.CreateDirectory(officeCache);
            await File.WriteAllTextAsync(Path.Combine(officeCache,new string('a',64)+".pdf"),"%PDF-1.4\nfixture");
            officeStats=await office.RequestAsync("cache.stats",[]);
            if(officeStats.GetProperty("cacheCount").GetInt64()!=1)throw new Exception("office cache statistics missing fixture");
            var image=Path.Combine(root,"build","notification-icon.png");
            var prepared=await host.RequestAsync("ensure",[image,"skim-thumbnail"]);
            if(!File.Exists(prepared.GetProperty("imagePath").GetString()))throw new Exception("thumbnail missing");
            await metadata.RequestAsync("previewMetadata",[Guid.NewGuid().ToString(),image]);
            await Task.WhenAll(host.RequestAsync("stats",[]),host.RequestAsync("skimStats",[]));
            if(!host.IsActive)throw new Exception("host did not start");
            Console.WriteLine("worker active; waiting for idle retirement");
            await Task.Delay(TimeSpan.FromSeconds(68));
            if(host.IsActive||metadata.IsActive||office.IsActive)throw new Exception("idle host retained");
            var officeRestored=await office.RequestAsync("cache.stats",[]);
            if(!office.IsActive||officeStats.GetRawText()!=officeRestored.GetRawText())throw new Exception("office stats did not survive restart");
            await host.RequestAsync("stats",[]);if(!host.IsActive)throw new Exception("host did not restart");
            await metadata.RequestAsync("previewMetadata",[Guid.NewGuid().ToString(),image]);
            if(!metadata.IsActive)throw new Exception("metadata did not restart");
            var restored=await host.RequestAsync("ensure",[image,"skim-thumbnail"]);
            if(!File.Exists(restored.GetProperty("imagePath").GetString()))throw new Exception("cache lost on restart");
            Console.WriteLine("thumbnail, metadata and Office stats idle retirement, restart and cache reuse passed");
        }finally{Directory.Delete(data,true);}
    }
}
