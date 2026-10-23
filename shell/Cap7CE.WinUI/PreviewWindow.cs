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
    private readonly Grid root=new(){Padding=new(12)};
    private readonly ContentControl content=new(){HorizontalContentAlignment=HorizontalAlignment.Stretch,VerticalContentAlignment=VerticalAlignment.Stretch};
    private readonly TextBlock status=Ui.Text("",true);
    private readonly Button pageBack,pageForward;
    private readonly StackPanel toolbar;
    private IReadOnlyList<AssetItem> items=[];
    private CancellationTokenSource reading=new();
    private string sessionId="",kind="",pdfPath="";
    private int index,page=1,pageCount;
    private MediaPlayerElement? media;
    private readonly PreviewWindowGeometry geometry;
    public PreviewWindow(ShellServices services,Window owner)
    {
        geometry=new(this,owner);
        this.services=services;AppWindow.Resize(new(1100,820));
        root.RowDefinitions.Add(new(){Height=GridLength.Auto});root.RowDefinitions.Add(new(){Height=new(1,GridUnitType.Star)});root.RowDefinitions.Add(new(){Height=GridLength.Auto});
        pageBack=Ui.Button("上一页",()=>RenderPage(-1));pageForward=Ui.Button("下一页",()=>RenderPage(1));
        toolbar=Ui.Row(Ui.Tool("\uE72B","上一个文件",()=>Move(-1)),Ui.Tool("\uE72A","下一个文件",()=>Move(1)),pageBack,pageForward,
            Ui.Button("默认程序打开",()=>OpenExternal()));root.Children.Add(toolbar);
        Grid.SetRow(content,1);root.Children.Add(content);Grid.SetRow(status,2);root.Children.Add(status);
        var surface=new ContentControl {Content=root,IsTabStop=true,HorizontalContentAlignment=HorizontalAlignment.Stretch,VerticalContentAlignment=VerticalAlignment.Stretch};Content=surface;
        Activated+=(_,_)=>surface.Focus(FocusState.Programmatic);
        surface.KeyDown+=(_,e)=>{if(e.OriginalSource is TextBox)return;if(e.Key is VirtualKey.Escape or VirtualKey.Space){e.Handled=true;if(!e.KeyStatus.WasKeyDown)Close();}else if(e.Key==VirtualKey.Left){e.Handled=true;Move(-1);}else if(e.Key==VirtualKey.Right){e.Handled=true;Move(1);}};
        Closed+=(_,_)=>{reading.Cancel();media?.MediaPlayer?.Pause();media?.MediaPlayer?.Dispose();_=CloseSessionAsync();};
        services.Preferences.Changed+=ApplyTheme;Closed+=(_,_)=>services.Preferences.Changed-=ApplyTheme;ApplyTheme();
    }
    private void ApplyTheme()=>DispatcherQueue.TryEnqueue(()=>ThemeService.Apply(this,root,services.Preferences.Current));
    public void Show(AssetItem item,IReadOnlyList<AssetItem> source)
    {
        items=source.Where(i=>!i.Entry.IsDirectory).ToArray();index=Array.IndexOf(items.ToArray(),item);if(index<0){items=[item];index=0;}
        Activate();Load(item);
    }
    private void Move(int delta){var target=index+delta;if(target<0||target>=items.Count)return;index=target;Load(items[index]);}
    private async void Load(AssetItem item)
    {
        reading.Cancel();reading.Dispose();reading=new();var token=reading.Token;
        media?.MediaPlayer?.Pause();media?.MediaPlayer?.Dispose();media=null;content.Content=null;status.Text="正在准备预览…";
        pageBack.Visibility=pageForward.Visibility=Visibility.Collapsed;
        toolbar.Visibility=status.Visibility=Visibility.Visible;root.Padding=new(12);
        try
        {
            await CloseSessionAsync();token.ThrowIfCancellationRequested();FileAccessGuard.Validate(item);
            sessionId=Guid.NewGuid().ToString();kind=item.Entry.IsDirectory?"folder":FormatRegistry.Find(item.Entry.Extension)?.PreviewKind??"fileInfo";
            if(kind is "folder" or "fileInfo")
            {
                content.Content=Text($"{item.Name}\n\n类型：{(item.Entry.IsDirectory?"文件夹":item.Entry.Extension)}\n大小：{item.SizeLabel}\n修改时间：{item.ModifiedLabel}\n位置：{item.FullPath}");
                status.Text="基本信息 · 可用默认程序打开";return;
            }
            if(kind is "video" or "audio")
            {
                media=new MediaPlayerElement {AreTransportControlsEnabled=true,AutoPlay=false,Source=MediaSource.CreateFromStorageFile(await StorageFile.GetFileFromPathAsync(item.FullPath))};
                if(token.IsCancellationRequested){media.MediaPlayer?.Dispose();return;}content.Content=media;status.Text="使用原生媒体控件播放";return;
            }
            if(kind=="text")
            {
                var reply=await services.Providers.RequestAsync("text.read",[sessionId,item.FullPath],token);
                if(!reply.GetProperty("ok").GetBoolean())throw new IOException(reply.GetProperty("error").GetProperty("message").GetString());
                if(token.IsCancellationRequested)return;
                var value=reply.GetProperty("value");content.Content=Text(value.GetProperty("content").GetString()??"");
                status.Text=value.GetProperty("truncated").GetBoolean()?"正文已按上限截断":"正文预览";return;
            }
            if(kind is "pdf" or "office")
            {
                pdfPath=item.FullPath;
                if(kind=="office")pdfPath=(await services.Office.RequestAsync("office.open",[sessionId,item.FullPath],token)).GetProperty("pdfPath").GetString()!;
                var reply=await services.Providers.RequestAsync("pdf.open",[sessionId,pdfPath,item.FullPath],token);
                if(token.IsCancellationRequested)return;pageCount=reply.GetProperty("pageCount").GetInt32();page=1;
                pageBack.Visibility=pageForward.Visibility=Visibility.Visible;await PageAsync(token);return;
            }
            if(kind is "epub" or "mobi" or "archive" or "font")
            {
                var args=kind=="font"?new object?[]{sessionId,item.FullPath,"zh-CN"}:new object?[]{sessionId,item.FullPath};
                var reply=await services.Providers.RequestAsync(kind+".open",args,token);if(token.IsCancellationRequested)return;
                if(kind is "epub" or "mobi")content.Content=Text(string.Join("\n\n",reply.GetProperty("chapters").EnumerateArray().Select(c=>c.GetProperty("text").GetString())));
                else if(kind=="archive")content.Content=Text(string.Join("\n",reply.GetProperty("entries").EnumerateArray().Select(e=>(e.GetProperty("directory").GetBoolean()?"▸ ":"  ")+e.GetProperty("path").GetString())));
                else content.Content=Text($"字体：{reply.GetProperty("familyName")}\n样式：{reply.GetProperty("styleName")}\n字重：{reply.GetProperty("weight")}\n字形数：{reply.GetProperty("glyphCount")}\n\n原生动态字体字样展示尚未迁入，可使用默认程序打开。");
                status.Text=kind=="archive"?"压缩包目录（只读）":"只读预览";return;
            }
            var prepared=await services.Visuals.PrepareAsync(item.FullPath,true,token);
            token.ThrowIfCancellationRequested();
            toolbar.Visibility=status.Visibility=Visibility.Collapsed;root.Padding=new(5);
            var previewImage=new ImagePreviewView(()=>Move(-1),()=>Move(1),()=>OpenExternal(true),index>0,index<items.Count-1);content.Content=previewImage;
            var dimensions=await previewImage.LoadAsync(prepared,token);
            token.ThrowIfCancellationRequested();geometry.Apply(dimensions.Width,dimensions.Height);
            if(!token.IsCancellationRequested)status.Text=$"{index+1} / {items.Count} · Space / Esc 关闭";
        }
        catch(OperationCanceledException){}
        catch(Exception error){if(!token.IsCancellationRequested){toolbar.Visibility=status.Visibility=Visibility.Visible;root.Padding=new(12);content.Content=Text("此格式暂不可预览，可用默认程序打开。");status.Text=error.Message;}}
    }
    private static ScrollViewer Text(string text)
    {
        var scroll=new ScrollViewer {Content=new TextBlock {Text=text,IsTextSelectionEnabled=true,TextWrapping=TextWrapping.Wrap,Margin=new(12),FontSize=15},HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled};
        IdleScrollBars.Attach(scroll);return scroll;
    }
    private async void RenderPage(int delta)
    {
        if(page+delta<1||page+delta>pageCount)return;page+=delta;
        try{await PageAsync(reading.Token);}catch(OperationCanceledException){}catch(Exception error){status.Text=error.Message;}
    }
    private async Task PageAsync(CancellationToken token)
    {
        pageBack.IsEnabled=pageForward.IsEnabled=false;
        var reply=await services.Providers.RequestAsync("pdf.render",[sessionId,pdfPath,page],token);
        var bytes=Convert.FromBase64String(reply.GetProperty("base64").GetString()!);
        using var stream=new InMemoryRandomAccessStream();using(var writer=new DataWriter(stream.GetOutputStreamAt(0))){writer.WriteBytes(bytes);await writer.StoreAsync();}
        stream.Seek(0);var bitmap=new BitmapImage();await bitmap.SetSourceAsync(stream);
        if(token.IsCancellationRequested)return;content.Content=new Image {Source=bitmap,Stretch=Stretch.Uniform};status.Text=$"第 {page} / {pageCount} 页";
        pageBack.IsEnabled=page>1;pageForward.IsEnabled=page<pageCount;
    }
    private async Task CloseSessionAsync()
    {
        var id=sessionId;var old=kind;sessionId="";kind="";if(id.Length==0)return;
        try
        {
            if(old=="text")await services.Providers.RequestAsync("text.cancel",[id]);
            else if(old is "pdf" or "office")await services.Providers.RequestAsync("pdf.close",[id]);
            else if(old is "font" or "epub" or "mobi" or "archive")await services.Providers.RequestAsync(old+".close",[id]);
            if(old=="office")await services.Office.RequestAsync("office.close",[id]);
        }catch{}
    }
    private void OpenExternal(bool closeAfter=false)
    {if(index<0||index>=items.Count)return;try{FileAccessGuard.Validate(items[index]);System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(items[index].FullPath){UseShellExecute=true});if(closeAfter)Close();}catch(Exception error){status.Visibility=Visibility.Visible;status.Text=error.Message;}}
}
