using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;

namespace Cap7CE.WinUI.Controls;

// The browser only decodes one in-memory image; a transparent input surface above
// it lets the existing ScrollViewer own pointer, wheel and touch gestures.
internal sealed class AnimatedImageView : Grid,IDisposable
{
    private const string ImageUri="https://cap7ce-animation.invalid/image";
    private const string DocumentUri="https://cap7ce-animation.invalid/preview";
    private const string Document="<!doctype html><meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; img-src https://cap7ce-animation.invalid; style-src 'unsafe-inline'\"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}img{width:100%;height:100%;object-fit:contain}</style><img src='"+ImageUri+"'>";
    private readonly WebView2 browser=new(){IsHitTestVisible=false,IsTabStop=false,DefaultBackgroundColor=Windows.UI.Color.FromArgb(0,0,0,0)};
    private bool disposed;
    private MemoryStream? response;
    private MemoryStream? documentResponse;
    public AnimatedImageView()
    {
        browser.Resources["SolidBackgroundFillColorBase"]=Windows.UI.Color.FromArgb(0,0,0,0);
        browser.Resources["ApplicationPageBackgroundThemeBrush"]=new Microsoft.UI.Xaml.Media.SolidColorBrush(Microsoft.UI.Colors.Transparent);
        Children.Add(browser);
        Children.Add(new Border {Background=new Microsoft.UI.Xaml.Media.SolidColorBrush(Microsoft.UI.Colors.Transparent)});
        Unloaded+=(_,_)=>Dispose();
    }
    public async Task LoadAsync(AnimationSource source,CancellationToken token)
    {
        using var cancellation=token.Register(()=>DispatcherQueue.TryEnqueue(Dispose));
        var environment=await CoreWebView2Environment.CreateWithOptionsAsync(null,Path.Combine(PreferenceStore.DataRoot,"animation-webview"),new CoreWebView2EnvironmentOptions()).AsTask(token);
        token.ThrowIfCancellationRequested();if(disposed)throw new OperationCanceledException(token);
        await browser.EnsureCoreWebView2Async(environment).AsTask(token);
        token.ThrowIfCancellationRequested();if(disposed)throw new OperationCanceledException(token);
        browser.DefaultBackgroundColor=Windows.UI.Color.FromArgb(0,0,0,0);
        var core=browser.CoreWebView2;
        core.Settings.IsScriptEnabled=false;core.Settings.AreDefaultContextMenusEnabled=false;
        core.Settings.AreDevToolsEnabled=false;core.Settings.IsWebMessageEnabled=false;
        core.Settings.IsZoomControlEnabled=false;core.Settings.AreBrowserAcceleratorKeysEnabled=false;
        core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
        core.WebResourceRequested+=(_,e)=>{
            if(!disposed&&e.Request.Uri==DocumentUri) {
                documentResponse?.Dispose();documentResponse=new MemoryStream(System.Text.Encoding.UTF8.GetBytes(Document),false);
                e.Response=environment.CreateWebResourceResponse(documentResponse.AsRandomAccessStream(),200,"OK","Content-Type: text/html; charset=utf-8\r\nCache-Control: no-store");
            } else if(!disposed&&e.Request.Uri==ImageUri) {
                response?.Dispose();response=new MemoryStream(source.Bytes,false);
                e.Response=environment.CreateWebResourceResponse(response.AsRandomAccessStream(),200,"OK","Content-Type: "+source.MimeType+"\r\nCache-Control: no-store");
            } else e.Response=environment.CreateWebResourceResponse(null,403,"Forbidden","");
        };
        ulong? navigationId=null;
        core.NavigationStarting+=(_,e)=>{
            if(e.Uri==DocumentUri&&navigationId is null)navigationId=e.NavigationId;
            else e.Cancel=true;
        };
        core.NewWindowRequested+=(_,e)=>e.Handled=true;
        core.PermissionRequested+=(_,e)=>e.State=CoreWebView2PermissionState.Deny;
        var ready=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        void Completed(object? sender,CoreWebView2NavigationCompletedEventArgs e) {
            if(e.NavigationId!=navigationId)return;
            if(e.IsSuccess)ready.TrySetResult();else ready.TrySetException(new UiFailure("ui.preview.animationDisplayFailed",new Dictionary<string,object?>{{"status",e.WebErrorStatus}}));
        }
        core.NavigationCompleted+=Completed;
        try {
            core.Navigate(DocumentUri);
            await ready.Task.WaitAsync(TimeSpan.FromSeconds(15),token);
            // Host-side inspection still works with page scripts disabled.
            var decoded=await core.ExecuteScriptAsync("Boolean(document.images[0]?.complete && document.images[0]?.naturalWidth > 0)").AsTask(token);
            if(decoded!="true")throw new UiFailure("ui.preview.animationDecodeFailed");
        } finally {core.NavigationCompleted-=Completed;}
    }
    public void Dispose()
    {
        if(disposed)return;disposed=true;browser.Close();response?.Dispose();response=null;documentResponse?.Dispose();documentResponse=null;
    }
}
