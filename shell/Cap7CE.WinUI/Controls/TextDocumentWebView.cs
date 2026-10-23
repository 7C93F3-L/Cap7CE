using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;

namespace Cap7CE.WinUI.Controls;

internal sealed class TextDocumentWebView : Grid,IDisposable
{
    private const string DocumentUri="https://cap7ce-text.invalid/preview";
    private readonly WebView2 browser=new();
    private readonly List<MemoryStream> responses=[];
    private bool disposed;
    public TextDocumentWebView(){Children.Add(browser);Unloaded+=(_,_)=>Dispose();}
    public async Task LoadAsync(string html,CancellationToken token)
    {
        using var cancellation=token.Register(()=>DispatcherQueue.TryEnqueue(Dispose));
        var environment=await CoreWebView2Environment.CreateWithOptionsAsync(null,Path.Combine(PreferenceStore.DataRoot,"text-webview"),new CoreWebView2EnvironmentOptions()).AsTask(token);
        token.ThrowIfCancellationRequested();if(disposed)throw new OperationCanceledException(token);
        await browser.EnsureCoreWebView2Async(environment).AsTask(token);
        token.ThrowIfCancellationRequested();if(disposed)throw new OperationCanceledException(token);
        browser.DefaultBackgroundColor=Windows.UI.Color.FromArgb(0,0,0,0);
        var core=browser.CoreWebView2;
        core.Settings.IsScriptEnabled=false;core.Settings.IsWebMessageEnabled=false;
        core.Settings.AreDevToolsEnabled=false;core.Settings.AreDefaultContextMenusEnabled=false;
        core.Settings.IsStatusBarEnabled=false;
        core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
        core.WebResourceRequested+=(_,e)=>{
            if(!disposed&&e.Request.Uri==DocumentUri) {
                var stream=new MemoryStream(System.Text.Encoding.UTF8.GetBytes(html),false);responses.Add(stream);
                e.Response=environment.CreateWebResourceResponse(stream.AsRandomAccessStream(),200,"OK","Content-Type: text/html; charset=utf-8\r\nCache-Control: no-store");
            } else e.Response=environment.CreateWebResourceResponse(null,403,"Forbidden","");
        };
        ulong? navigationId=null;
        core.NavigationStarting+=(_,e)=>{
            if(e.Uri==DocumentUri&&navigationId is null)navigationId=e.NavigationId;
            else if(!e.Uri.StartsWith(DocumentUri+"#",StringComparison.Ordinal))e.Cancel=true;
        };
        core.NewWindowRequested+=(_,e)=>e.Handled=true;
        core.DownloadStarting+=(_,e)=>e.Cancel=true;
        core.PermissionRequested+=(_,e)=>e.State=CoreWebView2PermissionState.Deny;
        var ready=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        void Completed(object? sender,CoreWebView2NavigationCompletedEventArgs e) {
            if(e.NavigationId!=navigationId)return;
            if(e.IsSuccess)ready.TrySetResult();else ready.TrySetException(new IOException("正文显示失败："+e.WebErrorStatus));
        }
        core.NavigationCompleted+=Completed;
        try {core.Navigate(DocumentUri);await ready.Task.WaitAsync(TimeSpan.FromSeconds(15),token);}
        finally {core.NavigationCompleted-=Completed;}
    }
    public void Dispose()
    {
        if(disposed)return;disposed=true;browser.Close();
        foreach(var stream in responses)stream.Dispose();responses.Clear();
    }
}
