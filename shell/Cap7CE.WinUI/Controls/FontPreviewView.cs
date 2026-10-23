using System.Text.Json;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls;

internal sealed class FontPreviewView : Grid
{
    private readonly ContentControl content=new(){HorizontalContentAlignment=HorizontalAlignment.Stretch,VerticalContentAlignment=VerticalAlignment.Stretch};
    private readonly CancellationToken lifetime;
    private CancellationTokenSource? rendering;
    private byte[]? bytes;
    private JsonElement metadata;
    private TextDocumentWebView? browser;
    public FontPreviewView(CancellationToken token)
    {
        lifetime=token;Margin=new(56,0,56,0);Children.Add(content);
        Unloaded+=(_,_)=>{rendering?.Cancel();rendering?.Dispose();rendering=null;browser?.Dispose();bytes=null;};
        ActualThemeChanged+=async(_,_)=>{if(IsLoaded&&bytes is not null)try{await RenderAsync();}catch(OperationCanceledException){}catch(Exception error){NativeDiagnostics.VisualFailure(error);}};
    }
    public async Task LoadAsync(string path,JsonElement reply,CancellationToken token)
    {
        await using(var file=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete,4096,true)) {
            if(file.Length is <=0 or >64*1024*1024)throw new IOException("字体文件超过预览范围。");
            var data=new byte[checked((int)file.Length)];await file.ReadExactlyAsync(data,token);
            token.ThrowIfCancellationRequested();bytes=data;
        }
        metadata=reply.Clone();await RenderAsync();
    }
    private async Task RenderAsync()
    {
        rendering?.Cancel();rendering?.Dispose();rendering=CancellationTokenSource.CreateLinkedTokenSource(lifetime);
        var token=rendering.Token;var data=bytes;if(data is null)return;
        browser?.Dispose();content.Content=null;
        var dark=ActualTheme==ElementTheme.Dark;
        var html=await Task.Run(()=>FontPreviewDocument.Render(metadata,data,dark),token);token.ThrowIfCancellationRequested();
        browser=new TextDocumentWebView();content.Content=browser;await browser.LoadAsync(html,token,data);
    }
}
