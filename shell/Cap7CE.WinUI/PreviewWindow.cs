using System.Text.Json;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Storage;
using Windows.Storage.Streams;
using Windows.Media.Core;
using Windows.System;

namespace Cap7CE.WinUI;
internal sealed class PreviewWindow : Window
{
    private readonly ShellServices services;
    private readonly Grid root=new(){Padding=new(5)};
    private readonly ContentControl content=new(){HorizontalContentAlignment=HorizontalAlignment.Stretch,VerticalContentAlignment=VerticalAlignment.Stretch};
    private readonly Grid viewport=new();
    private readonly TextBlock status=Ui.Text("",true);
    private readonly PreviewNavigationView navigation;
    private IReadOnlyList<AssetItem> items=[];
    private CancellationTokenSource reading=new();
    private string sessionId="",kind="",pdfPath="";
    private int index;
    private MediaPreviewSession? media;
    private bool closed;
    private readonly PreviewWindowGeometry geometry;
    public PreviewWindow(ShellServices services,Window owner)
    {
        geometry=new(this,owner,viewport);
        this.services=services;AppWindow.Resize(new(1100,820));
        root.RowDefinitions.Add(new(){Height=GridLength.Auto});root.RowDefinitions.Add(new(){Height=new(1,GridUnitType.Star)});root.RowDefinitions.Add(new(){Height=GridLength.Auto});
        viewport.Children.Add(content);Grid.SetRow(viewport,1);root.Children.Add(viewport);Grid.SetRow(status,2);root.Children.Add(status);
        PreviewViewportStyle.Apply(viewport);
        navigation=new(()=>Move(-1),()=>Move(1));viewport.Children.Add(navigation);
        var surface=new ContentControl {Content=root,IsTabStop=true,HorizontalContentAlignment=HorizontalAlignment.Stretch,VerticalContentAlignment=VerticalAlignment.Stretch};Content=surface;
        Activated+=(_,_)=>surface.Focus(FocusState.Programmatic);
        surface.KeyDown+=(_,e)=>{if(e.OriginalSource is TextBox)return;if(e.Key is VirtualKey.Escape or VirtualKey.Space){e.Handled=true;if(!e.KeyStatus.WasKeyDown)Close();}else if(e.Key==VirtualKey.Left){e.Handled=true;Move(-1);}else if(e.Key==VirtualKey.Right){e.Handled=true;Move(1);}};
        Closed+=(_,_)=>{closed=true;reading.Cancel();ReleaseMedia();_=CloseSessionAsync();};
        services.Preferences.Changed+=ApplyTheme;Closed+=(_,_)=>services.Preferences.Changed-=ApplyTheme;ApplyTheme();
    }
    private void ApplyTheme()=>DispatcherQueue.TryEnqueue(()=>{if(!closed)ThemeService.Apply(this,root,services.Preferences.Current);});
    private void ReleaseMedia(){var previous=media;media=null;previous?.Dispose();}
    public void Show(AssetItem item,IReadOnlyList<AssetItem> source)
    {
        items=source.Where(i=>!i.Entry.IsDirectory).ToArray();index=Array.IndexOf(items.ToArray(),item);if(index<0){items=[item];index=0;}
        geometry.BeginOpen();Activate();Load(item);
    }
    private void Move(int delta){var target=index+delta;if(target<0||target>=items.Count)return;index=target;Load(items[index]);}
    private async void Load(AssetItem item)
    {
        if(closed)return;
        reading.Cancel();reading.Dispose();reading=new();var token=reading.Token;
        ReleaseMedia();content.Content=null;status.Text="正在准备预览…";
        status.Visibility=Visibility.Visible;root.Padding=new(5);
        navigation.Update(index>0,index<items.Count-1);
        var sourceValidated=false;
        try
        {
            await CloseSessionAsync();token.ThrowIfCancellationRequested();FileAccessGuard.Validate(item);sourceValidated=true;
            sessionId=Guid.NewGuid().ToString();kind=item.Entry.IsDirectory?"folder":FormatRegistry.Find(item.Entry.Extension)?.PreviewKind??"fileInfo";
            var animation=item.Entry.IsDirectory?null:await AnimationSource.TryLoadAsync(item.FullPath,token);
            token.ThrowIfCancellationRequested();
            if(animation is not null) {
                status.Visibility=Visibility.Collapsed;
                var animatedPreview=new ImagePreviewView(()=>OpenExternal(true));content.Content=animatedPreview;
                var size=await animatedPreview.LoadAnimationAsync(animation,token);
                token.ThrowIfCancellationRequested();geometry.Apply(size.Width,size.Height);return;
            }
            if(kind is "folder" or "fileInfo")
            {
                await ShowFileInfoAsync(item,token);return;
            }
            if(kind is "video" or "audio")
            {
                status.Visibility=Visibility.Collapsed;
                var file=await StorageFile.GetFileFromPathAsync(item.FullPath);
                token.ThrowIfCancellationRequested();
                if(kind=="audio")geometry.Apply(640,640);
                media=new MediaPreviewSession(file,message=>{if(!closed&&!token.IsCancellationRequested){status.Visibility=Visibility.Visible;status.Text=message;}},
                    (width,height)=>{if(!closed&&!token.IsCancellationRequested&&kind=="video")geometry.Apply(width,height);},autoPlayAndLoop:true);
                if(kind=="audio") {
                    var audio=new AudioPreviewView(item,media.Element);content.Content=audio;
                    await audio.LoadAsync(file,item,services,token);
                } else content.Content=media.Element;
                return;
            }
            if(kind=="text")
            {
                geometry.Apply(800,560,24,110);
                var reply=await services.Providers.RequestAsync("text.read",[sessionId,item.FullPath],token);
                if(!reply.GetProperty("ok").GetBoolean())throw new IOException(reply.GetProperty("error").GetProperty("message").GetString());
                if(token.IsCancellationRequested)return;
                var value=reply.GetProperty("value");var raw=value.GetProperty("content").GetString()??"";
                if(item.Entry.Extension.ToLowerInvariant() is ".doc" or ".docx") {
                    content.Content=Text(raw);status.Text=value.GetProperty("truncated").GetBoolean()?"正文已按上限截断":"正文预览";return;
                }
                status.Visibility=Visibility.Collapsed;
                var textPreview=new TextPreviewView(()=>OpenExternal(true),token);content.Content=textPreview;
                textPreview.SetText(raw,item.Entry.Extension,
                    (value.GetProperty("truncated").GetBoolean()?"正文已按 1 MiB 上限截断 · ":"")+value.GetProperty("encoding").GetString());return;
            }
            if(kind is "pdf" or "office")
            {
                pdfPath=item.FullPath;
                if(kind=="office")pdfPath=(await services.Office.RequestAsync("office.open",[sessionId,item.FullPath],token)).GetProperty("pdfPath").GetString()!;
                token.ThrowIfCancellationRequested();status.Visibility=Visibility.Collapsed;
                var pdf=new PdfPreviewView(()=>OpenExternal(true),
                    (width,height)=>{if(!closed&&!token.IsCancellationRequested)geometry.Apply(width,height);},
                    message=>{if(!closed&&!token.IsCancellationRequested){status.Visibility=Visibility.Visible;status.Text=message;}});
                content.Content=pdf;await pdf.LoadAsync(pdfPath,token);return;
            }
            if(kind is "epub" or "mobi" or "archive" or "font")
            {
                geometry.Apply(800,560,24,110);
                var args=kind=="font"?new object?[]{sessionId,item.FullPath,"zh-CN"}:new object?[]{sessionId,item.FullPath};
                var reply=await services.Providers.RequestAsync(kind+".open",args,token);if(token.IsCancellationRequested)return;
                if(kind is "epub" or "mobi") {
                    status.Visibility=Visibility.Collapsed;
                    var book=new TextPreviewView(()=>OpenExternal(true),token);content.Content=book;
                    book.SetBookText(reply.GetProperty("chapters").EnumerateArray().Select(c=>c.GetProperty("text").GetString()??"").ToArray());return;
                }
                else if(kind=="archive") {
                    status.Visibility=Visibility.Collapsed;content.Content=new ArchivePreviewView(reply);return;
                }
                else {
                    status.Visibility=Visibility.Collapsed;
                    var font=new FontPreviewView(token);content.Content=font;await font.LoadAsync(item.FullPath,reply,token);return;
                }
            }
            var prepared=await services.Visuals.PrepareAsync(item.FullPath,true,token);
            token.ThrowIfCancellationRequested();
            status.Visibility=Visibility.Collapsed;root.Padding=new(5);
            var previewImage=new ImagePreviewView(()=>OpenExternal(true));content.Content=previewImage;
            var dimensions=await previewImage.LoadAsync(prepared,token);
            token.ThrowIfCancellationRequested();geometry.Apply(dimensions.Width,dimensions.Height);
            if(!token.IsCancellationRequested)status.Text=$"{index+1} / {items.Count} · Space / Esc 关闭";
        }
        catch(OperationCanceledException){}
        catch(Exception error){if(!token.IsCancellationRequested){
            NativeDiagnostics.VisualFailure(error);
            await ShowFileInfoAsync(item,token,sourceValidated);
        }}
    }
    private async Task ShowFileInfoAsync(AssetItem item,CancellationToken token,bool readThumbnail=true)
    {
        if(closed||token.IsCancellationRequested)return;
        ReleaseMedia();geometry.Apply(720,680);status.Visibility=Visibility.Collapsed;
        var info=new FileInfoPreviewView(item,()=>OpenExternal(true));content.Content=info;
        if(readThumbnail)await info.LoadAsync(item,token);
    }
    private static ScrollViewer Text(string text)
    {
        var scroll=new ScrollViewer {Content=new TextBlock {Text=text,IsTextSelectionEnabled=true,TextWrapping=TextWrapping.Wrap,Margin=new(12),FontSize=15},HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled};
        IdleScrollBars.Attach(scroll);return scroll;
    }
    private async Task CloseSessionAsync()
    {
        var id=sessionId;var old=kind;sessionId="";kind="";if(id.Length==0)return;
        try
        {
            if(old=="text")await services.Providers.RequestAsync("text.cancel",[id]);
            else if(old is "font" or "epub" or "mobi" or "archive")await services.Providers.RequestAsync(old+".close",[id]);
            if(old=="office")await services.Office.RequestAsync("office.close",[id]);
        }catch{}
    }
    private void OpenExternal(bool closeAfter=false)
    {if(index<0||index>=items.Count)return;try{FileAccessGuard.Validate(items[index]);System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(items[index].FullPath){UseShellExecute=true});if(closeAfter)Close();}catch(Exception error){status.Visibility=Visibility.Visible;status.Text=error.Message;}}
}
