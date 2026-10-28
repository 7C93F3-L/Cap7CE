using System.Text.Json;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Services;

// Adapts the existing Core keyword writer, temporary model image and local model owners.
internal sealed class AutoKeywordProcessor(ShellServices services,string language)
{
    private readonly object context=services.ModelContextFor(language);
    public async Task ProcessAsync(AssetItem source,CancellationToken token,Action<string> phase)
    {
        var item=FileAccessGuard.ResolveIdentity(source,services.Volumes);
        var keywords=new ManualKeywordService(services);
        phase("准备图像");await keywords.ReadAsync(item,token); // Fail before inference if the source is not in Catalog.
        var identity=new{path=item.FullPath,fileReference=item.Entry.FileReference,createdUtcTicks=(long?)null,createdFileTimeMilliseconds=item.Entry.CreatedFileTimeMilliseconds};
        var fingerprint=await services.Visuals.RequestAsync("localKeywords.fingerprint",identity).WaitAsync(token);
        var image=await services.Visuals.RequestAsync("temporaryImage",item.FullPath).WaitAsync(token);
        token.ThrowIfCancellationRequested();var usingModel=false;
        try {
            phase("启动模型");await services.Models.RequestAsync("runtime.beginAI",[context,null]);usingModel=true;
            token.ThrowIfCancellationRequested();
            var ready=await services.Models.RequestAsync("runtime.ready",[context,null]);
            if(!ready.TryGetProperty("result",out var connection)||connection.ValueKind==JsonValueKind.Null) {
                var ownStartup=ready.GetProperty("state").GetProperty("status").GetString()!="starting";
                var startup=services.Models.RequestAsync("runtime.start",[context,"ai"]);
                using var cancelStartup=token.Register(()=>{if(ownStartup)_=StopStartupAsync();});
                var started=await startup.WaitAsync(token);
                token.ThrowIfCancellationRequested();
                if(started.GetProperty("state").GetProperty("status").GetString()!="running")throw new AutoKeywordRuntimeException("本地模型无法启动，请在设置中检查运行库和视觉模型。");
                ready=await services.Models.RequestAsync("runtime.ready",[context,null]);
                if(!ready.TryGetProperty("result",out connection)||connection.ValueKind==JsonValueKind.Null)throw new AutoKeywordRuntimeException("本地视觉模型尚未就绪，请检查模型设置。");
            }
            token.ThrowIfCancellationRequested();phase("生成关键词");
            var id=Guid.NewGuid().ToString();JsonElement result;
            try{result=await services.Visuals.RequestAsync("localKeywords.generate",id,connection,$"data:{image.GetProperty("mimeType").GetString()};base64,{image.GetProperty("base64").GetString()}",110000,language).WaitAsync(token);}
            finally{if(token.IsCancellationRequested)await services.Visuals.RequestAsync("localKeywords.cancel",id);}
            var generated=result.EnumerateArray().Select(word=>word.GetString()??"").ToArray();
            token.ThrowIfCancellationRequested();phase("保存关键词");
            await AutoKeywordWriter.SaveAsync(generated,fingerprint.GetString()!,
                cancellation=>keywords.ReadAsync(item,cancellation),
                async cancellation=>{FileAccessGuard.Validate(item);return (await services.Visuals.RequestAsync("localKeywords.fingerprint",identity).WaitAsync(cancellation)).GetString()!;},
                (words,revision)=>keywords.TrySaveAsync(item,words,revision),token);
        }
        finally{if(usingModel)try{await services.Models.RequestAsync("runtime.endAI",[context,null]);}catch(Exception error){System.Diagnostics.Debug.WriteLine(error);}}
    }
    private async Task StopStartupAsync(){try{await services.Models.RequestAsync("runtime.stop",[context,"关键词任务取消"]);}catch{}}
}
internal sealed class AutoKeywordRuntimeException(string message):IOException(message);
