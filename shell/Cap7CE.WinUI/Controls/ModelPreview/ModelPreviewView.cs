using System.Text;
using System.Text.Json;
using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using L=Cap7CE.WinUI.Localization.LanguageUi;

namespace Cap7CE.WinUI.Controls;

internal sealed class ModelPreviewView : Grid,IDisposable
{
    private readonly WebView2 browser=new(){DefaultBackgroundColor=Windows.UI.Color.FromArgb(0,0,0,0)};
    private readonly List<MemoryStream> responses=[];
    private readonly TaskCompletionSource ready=new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly Action<Exception> failed;
    private ModelPreviewResources? resources;
    private CancellationTokenRegistration cancellation;
    private bool disposed;
    public ModelPreviewView(Action<Exception> failed)
    {
        this.failed=failed;RowDefinitions.Add(new(){Height=GridLength.Auto});RowDefinitions.Add(new(){Height=new(1,GridUnitType.Star)});
        var reset=L.Tool("\uE777","ui.preview.modelReset",()=>_=CommandAsync("reset"));
        var gray=L.Tool("\uE790","ui.preview.modelGray",()=>_=CommandAsync("gray"));
        Children.Add(Ui.Row(reset,gray));Grid.SetRow(browser,1);Children.Add(browser);
        browser.Resources["SolidBackgroundFillColorBase"]=Windows.UI.Color.FromArgb(0,0,0,0);
        browser.Resources["ApplicationPageBackgroundThemeBrush"]=Windows.UI.Color.FromArgb(0,0,0,0);
        Unloaded+=(_,_)=>Dispose();
    }
    public async Task LoadAsync(AssetItem item,CancellationToken token)
    {
        var source=await Task.Run(()=>new ModelPreviewResources(item,token),token);
        if(disposed||token.IsCancellationRequested){source.Dispose();throw new OperationCanceledException(token);}
        resources=source;
        cancellation=token.Register(()=>DispatcherQueue.TryEnqueue(Dispose));token.ThrowIfCancellationRequested();
        var scriptPath=Path.Combine(AppContext.BaseDirectory,"Assets/ModelPreview/viewer.js");
        if(new FileInfo(scriptPath).Length>8*1024*1024)throw new UiFailure("ui.preview.modelFailed");
        var script=await File.ReadAllBytesAsync(scriptPath,token);
        var config=JsonSerializer.SerializeToUtf8Bytes(new{source=resources.SourceUri,extension=resources.Extension});
        var environment=await CoreWebView2Environment.CreateWithOptionsAsync(null,Path.Combine(PreferenceStore.DataRoot,"model-webview"),null).AsTask(token);
        token.ThrowIfCancellationRequested();if(disposed)throw new OperationCanceledException(token);
        await browser.EnsureCoreWebView2Async(environment).AsTask(token);
        token.ThrowIfCancellationRequested();if(disposed)throw new OperationCanceledException(token);
        var core=browser.CoreWebView2;
        core.Settings.IsScriptEnabled=true;core.Settings.IsWebMessageEnabled=true;core.Settings.AreHostObjectsAllowed=false;
        core.Settings.AreDevToolsEnabled=false;core.Settings.AreDefaultContextMenusEnabled=false;
        core.Settings.IsStatusBarEnabled=false;core.Settings.AreBrowserAcceleratorKeysEnabled=false;
        core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
        core.WebResourceRequested+=async(_,e)=>{
            var deferral=e.GetDeferral();
            try {
                if(disposed)throw new OperationCanceledException(token);
                byte[] bytes;string mime;
                if(e.Request.Method!="GET")throw new UnauthorizedAccessException();
                if(e.Request.Uri==ModelPreviewDocument.Uri){bytes=Encoding.UTF8.GetBytes(ModelPreviewDocument.Html);mime="text/html; charset=utf-8";}
                else if(e.Request.Uri==ModelPreviewDocument.ScriptUri){bytes=script;mime="text/javascript; charset=utf-8";}
                else if(e.Request.Uri==ModelPreviewDocument.ConfigUri){bytes=config;mime="application/json";}
                else {bytes=await resources.ReadAsync(e.Request.Uri);mime=Mime(e.Request.Uri);}
                token.ThrowIfCancellationRequested();if(disposed)throw new OperationCanceledException(token);
                var stream=new MemoryStream(bytes,false);responses.Add(stream);
                e.Response=environment.CreateWebResourceResponse(stream.AsRandomAccessStream(),200,"OK",ModelPreviewDocument.Headers+"Content-Type: "+mime);
            } catch {
                if(!disposed)e.Response=environment.CreateWebResourceResponse(null,403,"Forbidden","");
            } finally {try{deferral.Complete();}catch(System.Runtime.InteropServices.COMException){} }
        };
        ulong? navigationId=null;
        core.NavigationStarting+=(_,e)=>{if(e.Uri==ModelPreviewDocument.Uri&&navigationId is null)navigationId=e.NavigationId;else e.Cancel=true;};
        core.NewWindowRequested+=(_,e)=>e.Handled=true;core.DownloadStarting+=(_,e)=>e.Cancel=true;
        core.PermissionRequested+=(_,e)=>e.State=CoreWebView2PermissionState.Deny;
        core.NavigationCompleted+=(_,e)=>{if(e.NavigationId==navigationId&&!e.IsSuccess)ready.TrySetException(new UiFailure("ui.preview.modelFailed"));};
        core.ProcessFailed+=(_,_)=>{if(!disposed){var error=new UiFailure("ui.preview.modelFailed");ready.TrySetException(error);failed(error);Dispose();}};
        core.WebMessageReceived+=(_,e)=>{
            if(disposed||e.Source!=ModelPreviewDocument.Uri)return;
            try {
                using var json=JsonDocument.Parse(e.WebMessageAsJson);var type=json.RootElement.GetProperty("type").GetString();
                if(type=="ready")ready.TrySetResult();
                else if(type=="error")ready.TrySetException(new UiFailure("ui.preview.modelFailed",inner:new IOException(json.RootElement.GetProperty("message").GetString())));
            }catch(JsonException){}
        };
        core.Navigate(ModelPreviewDocument.Uri);
        await ready.Task.WaitAsync(TimeSpan.FromSeconds(20),token);token.ThrowIfCancellationRequested();
    }
    private static string Mime(string uri)=>Path.GetExtension(new Uri(uri).AbsolutePath).ToLowerInvariant() switch {
        ".png"=>"image/png",".jpg" or ".jpeg"=>"image/jpeg",".webp"=>"image/webp",_=>"application/octet-stream"
    };
    private async Task CommandAsync(string action)
    {
        if(disposed||!ready.Task.IsCompletedSuccessfully)return;
        try{await browser.CoreWebView2.ExecuteScriptAsync(action=="reset"?"window.modelPreview?.reset()":"window.modelPreview?.gray()");}
        catch(Exception error){if(!disposed)failed(error);}
    }
    public void Dispose()
    {
        if(disposed)return;disposed=true;cancellation.Dispose();resources?.Dispose();
        browser.Close();foreach(var stream in responses)stream.Dispose();responses.Clear();
        ready.TrySetCanceled();
    }
}
