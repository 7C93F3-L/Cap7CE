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
            await using var models=new CoreNodeHost(root,"model-runtime.cjs",Path.Combine(data,"model-data"));
            var context=new{runtimeRoot=Path.Combine(data,"runtimes"),modelsRoot=Path.Combine(data,"models"),language="zh-CN"};
            var runtimeSettings=await models.RequestAsync("modelSettings.invoke",[context,"runtime.settings",null]);
            var modelSettings=await models.RequestAsync("modelSettings.invoke",[context,"models.settings",null]);
            var state=await models.RequestAsync("runtime.state",[context,null]);
            if(!models.IsActive||state.GetProperty("state").GetProperty("status").GetString() is "running" or "starting")throw new Exception("configuration query started model service");
            await models.RequestAsync("runtime.beginAI",[context,null]);
            var officeStats=await office.RequestAsync("cache.stats",[]);
            if(!office.IsActive)throw new Exception("office stats host did not start");
            var officeCache=Path.GetFullPath(officeStats.GetProperty("cachePaths")[0].GetString()!);
            if(!officeCache.StartsWith(data+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("office fixture escaped temporary root");
            Directory.CreateDirectory(officeCache);
            await File.WriteAllTextAsync(Path.Combine(officeCache,new string('a',64)+".pdf"),"%PDF-1.4\nfixture");
            officeStats=await office.RequestAsync("cache.stats",[]);
            if(officeStats.GetProperty("cacheCount").GetInt64()!=1)throw new Exception("office cache statistics missing fixture");
            await using var provider=new CoreNodeHost(root,"provider-preview.cjs",Path.Combine(data,"provider"));
            var textId=Guid.NewGuid().ToString();var textFile=Path.Combine(data,"preview.txt");await File.WriteAllTextAsync(textFile,"preview fixture");
            await provider.RequestAsync("text.read",[textId,textFile]);
            var image=Path.Combine(root,"build","notification-icon.png");
            var prepared=await host.RequestAsync("ensure",[image,"skim-thumbnail"]);
            if(!File.Exists(prepared.GetProperty("imagePath").GetString()))throw new Exception("thumbnail missing");
            try { await host.RequestAsync("ensure",[Path.Combine(data,"missing.png"),"skim-thumbnail"]);throw new Exception("missing image unexpectedly succeeded"); }
            catch(IOException) { }
            await using var unknown=new CoreNodeHost(root,"visual-cache.cjs",Path.Combine(data,"unknown"));
            try { await unknown.RequestAsync("unknown",[]);throw new Exception("unknown operation unexpectedly succeeded"); }
            catch(IOException) { }
            await metadata.RequestAsync("previewMetadata",[Guid.NewGuid().ToString(),image]);
            await Task.WhenAll(host.RequestAsync("stats",[]),host.RequestAsync("skimStats",[]));
            if(!host.IsActive)throw new Exception("host did not start");
            Console.WriteLine("worker active; waiting for idle retirement");
            await Task.Delay(TimeSpan.FromSeconds(68));
            if(host.IsActive||metadata.IsActive||office.IsActive)throw new Exception("idle host retained");
            if(!unknown.IsActive)throw new Exception("unknown operation incorrectly allowed idle retirement");
            var runtimeRestored=await models.RequestAsync("modelSettings.invoke",[context,"runtime.settings",null]);
            var modelsRestored=await models.RequestAsync("modelSettings.invoke",[context,"models.settings",null]);
            if(!models.IsActive||runtimeSettings.GetRawText()!=runtimeRestored.GetRawText()||modelSettings.GetRawText()!=modelsRestored.GetRawText())throw new Exception("model configuration changed on restart");
            if(!models.IsActive)throw new Exception("active AI reference retired model host");
            await models.RequestAsync("runtime.endAI",[context,null]);
            await models.RequestAsync("runtime.stop",[context,"fixture stop"]);
            if(!provider.IsActive)throw new Exception("active preview host retired");
            await provider.RequestAsync("text.cancel",[textId]);
            await Task.Delay(TimeSpan.FromSeconds(68));
            if(models.IsActive)throw new Exception("stopped model host retained");
            if(provider.IsActive)throw new Exception("closed preview host retained");
            await provider.RequestAsync("text.read",[Guid.NewGuid().ToString(),textFile]);
            if(!provider.IsActive)throw new Exception("preview host did not restart");
            var officeRestored=await office.RequestAsync("cache.stats",[]);
            if(!office.IsActive||officeStats.GetRawText()!=officeRestored.GetRawText())throw new Exception("office stats did not survive restart");
            await host.RequestAsync("stats",[]);if(!host.IsActive)throw new Exception("host did not restart");
            await metadata.RequestAsync("previewMetadata",[Guid.NewGuid().ToString(),image]);
            if(!metadata.IsActive)throw new Exception("metadata did not restart");
            var restored=await host.RequestAsync("ensure",[image,"skim-thumbnail"]);
            if(!File.Exists(restored.GetProperty("imagePath").GetString()))throw new Exception("cache lost on restart");
            Console.WriteLine("completed visual failure, preview sessions, metadata, Office stats and model configuration idle retirement/restart passed");
        }finally{Directory.Delete(data,true);}
    }
}
