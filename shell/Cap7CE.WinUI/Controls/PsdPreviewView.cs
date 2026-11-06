using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media.Imaging;
using L=Cap7CE.WinUI.Localization.LanguageUi;

namespace Cap7CE.WinUI.Controls;

// Owns only board navigation. Parsing and decoded source memory stay in the Core provider worker.
internal sealed class PsdPreviewView : Grid
{
    private readonly CoreNodeHost provider;
    private readonly string session;
    private readonly ImagePreviewView viewer;
    private readonly Button previous,next;
    private readonly FrameworkElement pageTools;
    private readonly TextBlock count=Ui.Text("",true);
    private readonly Action<double,double> resized;
    private readonly Action<UiMessage> failed;
    private AssetItem? item;
    private (int Width,int Height)[] pages=[];
    private CancellationToken token;
    private CancellationTokenRegistration cancellation;
    private int page,wheelDelta;
    private bool rendering;
    public PsdPreviewView(CoreNodeHost provider,string session,Action openExternal,Action<double,double> resized,Action<UiMessage> failed)
    {
        this.provider=provider;this.session=session;this.resized=resized;this.failed=failed;
        previous=L.Tool("\uE76B","ui.preview.previousPage",()=>Move(-1));next=L.Tool("\uE76C","ui.preview.nextPage",()=>Move(1));
        count.VerticalAlignment=VerticalAlignment.Center;
        pageTools=Ui.Row(previous,count,next);pageTools.Visibility=Visibility.Collapsed;
        viewer=new(openExternal,pageTools,WheelPage);Children.Add(viewer);
        Unloaded+=(_,_)=>{cancellation.Dispose();_=CloseAsync();};
    }
    public async Task<bool> TryLoadAsync(AssetItem source,CancellationToken cancellationToken)
    {
        item=source;token=cancellationToken;cancellation=token.Register(()=>_=CloseAsync());
        try {
            token.ThrowIfCancellationRequested();
            var reply=await provider.RequestAsync("psd.open",[session,source.FullPath],token);
            token.ThrowIfCancellationRequested();
            pages=reply.GetProperty("pages").EnumerateArray().Select(p=>(p.GetProperty("width").GetInt32(),p.GetProperty("height").GetInt32())).ToArray();
            if(pages.Length is <1 or >128)throw new IOException("psd-preview-response");
            pageTools.Visibility=pages.Length>1?Visibility.Visible:Visibility.Collapsed;viewer.WheelAction=pages.Length>1?WheelPage:null;
            await RenderAsync();return true;
        }catch(OperationCanceledException){throw;}
        catch(Exception error){NativeDiagnostics.VisualFailure(error);await CloseAsync();return false;}
    }
    private async Task CloseAsync(){try{await provider.RequestAsync("psd.close",[session]);}catch{}}
    private void WheelPage(int delta)
    {
        if(rendering||token.IsCancellationRequested){wheelDelta=0;return;}
        if(Math.Sign(delta)!=Math.Sign(wheelDelta))wheelDelta=0;
        wheelDelta+=delta;if(Math.Abs(wheelDelta)<120)return;
        var direction=-Math.Sign(wheelDelta);wheelDelta=0;Move(direction);
    }
    private async void Move(int delta)
    {
        if(rendering||item is null||token.IsCancellationRequested)return;
        var target=page+delta;if(target<0||target>=pages.Length)return;var old=page;page=target;
        try{await RenderAsync();}catch(OperationCanceledException){}
        catch(Exception error){page=old;UpdateButtons();failed(FailureText.From(error));await CloseAsync();}
    }
    private void UpdateButtons(){previous.IsEnabled=!rendering&&page>0;next.IsEnabled=!rendering&&page+1<pages.Length;}
    private async Task RenderAsync()
    {
        rendering=true;UpdateButtons();
        try {
            await Task.Run(()=>FileAccessGuard.Validate(item!),token);
            var reply=await provider.RequestAsync("psd.render",[session,item!.FullPath,page],token);token.ThrowIfCancellationRequested();
            var encoded=reply.GetProperty("base64").GetString()!;if(encoded.Length>32*1024*1024)throw new IOException("psd-preview-output-limit");
            using var input=new MemoryStream(Convert.FromBase64String(encoded));var bitmap=new BitmapImage();
            await bitmap.SetSourceAsync(input.AsRandomAccessStream()).AsTask(token);token.ThrowIfCancellationRequested();
            viewer.SetBitmap(bitmap);count.Text=$"{page+1} / {pages.Length}";resized(pages[page].Width,pages[page].Height);
        }finally{rendering=false;if(!token.IsCancellationRequested)UpdateButtons();}
    }
}
