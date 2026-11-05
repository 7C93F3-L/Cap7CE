using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;

internal static class ModelPreviewChecks
{
    private static void Require(bool value,string message){if(!value)throw new Exception(message);}
    private static async Task Reject(Func<Task> action,string message)
    {
        try{await action();}catch(Exception error)when(error is UnauthorizedAccessException or OperationCanceledException or Cap7CE.WinUI.Localization.UiFailure){return;}
        throw new Exception(message);
    }
    public static async Task RunAsync()
    {
        var folder=Path.Combine(Path.GetTempPath(),"cap7ce-model-check-"+Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        try {
            var path=Path.Combine(folder,"模型 #1.obj");await File.WriteAllTextAsync(path,"v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3");
            var item=new AssetItem(new BasicSearchItem("model","模型 #1.obj","模型 #1.obj",".obj",false),path);
            using var resources=new ModelPreviewResources(item,CancellationToken.None);
            var uri=resources.SourceUri;
            Require(ModelPreviewPolicy.Resolve(path,uri)==path,"Unicode and escaped model names resolve exactly");
            Require((await resources.ReadAsync(uri)).Length==new FileInfo(path).Length,"model snapshot returned");
            using(var exclusive=new FileStream(path,FileMode.Open,FileAccess.ReadWrite,FileShare.None)){}
            var texture=Path.Combine(folder,"texture.png");await File.WriteAllBytesAsync(texture,[1,2,3]);
            Require((await resources.ReadAsync(ModelPreviewPolicy.Origin+"source/texture.png")).SequenceEqual(new byte[]{1,2,3}),"local companion read");
            foreach(var denied in new[]{"https://example.com/model.obj",ModelPreviewPolicy.Origin+"source/%2e%2e/outside.png",ModelPreviewPolicy.Origin+"source/sub%2f..%2foutside.png",ModelPreviewPolicy.Origin+"source/C%3a/private.png",ModelPreviewPolicy.Origin+"source/sub%5cprivate.png",ModelPreviewPolicy.Origin+"source/other.obj",ModelPreviewPolicy.Origin+"source/file.exe"})
                await Reject(()=>resources.ReadAsync(denied),"out-of-scope model resource accepted: "+denied);
            using(var stopping=new CancellationTokenSource()) {
                using var cancelled=new ModelPreviewResources(item,stopping.Token);stopping.Cancel();
                await Reject(()=>cancelled.ReadAsync(uri),"cancelled model still reads");
            }
            await File.AppendAllTextAsync(path,"\n# changed");
            await Reject(()=>resources.ReadAsync(uri),"source replacement not detected");
            using(var large=new FileStream(path,FileMode.Open,FileAccess.Write))large.SetLength(ModelPreviewPolicy.MaximumFileBytes+1);
            await Reject(()=>{using var rejected=new ModelPreviewResources(item,CancellationToken.None);return Task.CompletedTask;},"oversized model accepted");
        } finally {Directory.Delete(folder,true);}
        Console.WriteLine("3D preview scope, snapshots, handle release, cancellation and size limits passed.");
    }
}
