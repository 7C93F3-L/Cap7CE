using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using System.Globalization;
using System.Text.Json;
using Windows.ApplicationModel.DataTransfer;

namespace Cap7CE.WinUI.Controls;

internal sealed class DetailsEmbeddedMetadata : UserControl
{
    private readonly ShellServices services;
    private readonly DetailsCard card=new("内嵌元数据");
    private StackPanel Body=>card.Body;
    private long revision;
    private readonly DispatcherTimer copyFeedback=new(){Interval=TimeSpan.FromSeconds(1.5)};
    private Button? copyButton;
    public DetailsEmbeddedMetadata(ShellServices services)
    {
        this.services=services;Content=card;
        copyFeedback.Tick+=(_,_)=>{copyFeedback.Stop();if(copyButton is not null)copyButton.Content="复制";};
        Unloaded+=(_,_)=>copyFeedback.Stop();
    }
    public void Reset()
    {
        revision++;
        Clear();Body.Children.Add(Ui.Text("读取中…",true));
    }
    private void Clear(){copyFeedback.Stop();copyButton=null;while(Body.Children.Count>1)Body.Children.RemoveAt(1);}
    private void AddCopy(string text)
    {
        var button=new Button {Content="复制"};
        button.FontSize=12;button.MinWidth=0;button.Padding=new(8,4,8,4);button.HorizontalAlignment=HorizontalAlignment.Right;
        button.Click+=(_,_)=>{
            copyFeedback.Stop();
            try{var data=new DataPackage();data.SetText(text);Clipboard.SetContent(data);button.Content="已复制";}
            catch(Exception){button.Content="复制失败";}
            copyButton=button;copyFeedback.Start();
        };
        Body.Children.Add(button);
    }
    public async Task ReadAsync(AssetItem item,CancellationToken token)
    {
        var expected=revision;
        using var timeout=CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(10));
        var id=Guid.NewGuid().ToString();
        try {
            FileAccessGuard.Validate(item);timeout.Token.ThrowIfCancellationRequested();
            JsonElement metadata=default;
            if(item.Entry.SizeBytes is {} size&&item.Entry.ModifiedUtcTicks is {} ticks
                &&File.Exists(Path.Combine(PreferenceStore.ProductData,"index","cap7ce-index.db"))) {
                try {
                    var modified=DateTime.FromFileTimeUtc(ticks).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'",CultureInfo.InvariantCulture);
                    var stored=await services.StoredMetadata.RequestAsync("storedMetadata",[id,item.FullPath,new{fileSize=size,modifiedAt=modified}],timeout.Token);
                    if(stored.TryGetProperty("isCurrent",out var current)&&current.ValueKind==JsonValueKind.True
                        &&stored.TryGetProperty("metadata",out var saved)&&saved.ValueKind==JsonValueKind.Object)metadata=saved;
                }catch(OperationCanceledException){throw;}catch(Exception){ /* A missing legacy result can be read from the selected source. */ }
            }
            timeout.Token.ThrowIfCancellationRequested();
            if(metadata.ValueKind!=JsonValueKind.Object)
                metadata=await services.StoredMetadata.RequestAsync("previewMetadata",[id,item.FullPath],timeout.Token);
            timeout.Token.ThrowIfCancellationRequested();if(expected!=revision)return;
            Clear();
            if(metadata.ValueKind==JsonValueKind.Object) {
                if(metadata.TryGetProperty("items",out var items)&&items.ValueKind==JsonValueKind.Array)
                    foreach(var entry in items.EnumerateArray()) {
                        var kind=entry.GetProperty("kind").GetString();var text=entry.GetProperty("text").GetString();
                        if(!string.IsNullOrWhiteSpace(text)){card.Field(Label(kind),text,true);if(kind=="visual_content")AddCopy(text);}
                    }
                if(metadata.TryGetProperty("capturedAt",out var captured)&&captured.ValueKind==JsonValueKind.String
                    &&DateTimeOffset.TryParse(captured.GetString(),out var date))card.Field("拍摄时间",date.LocalDateTime.ToString("g"),true);
            }
            if(Body.Children.Count==1)Body.Children.Add(Ui.Text("未发现内嵌元数据",true));
        }catch(OperationCanceledException){if(!token.IsCancellationRequested&&expected==revision){Clear();Body.Children.Add(Ui.Text("读取超时，请重新选择文件重试",true));}}
        catch(Exception error){if(!token.IsCancellationRequested&&expected==revision){Clear();Body.Children.Add(Ui.Text("暂时无法读取内嵌元数据",true));NativeDiagnostics.VisualFailure(error);}}
        finally {
            if(timeout.IsCancellationRequested)try{await services.StoredMetadata.RequestAsync("cancelPreviewMetadata",[id]);}catch(Exception){}
        }
    }
    private static string Label(string? kind)=>kind switch {
        "visual_content"=>"提示词 / 内容描述","embedded_title"=>"标题","embedded_subject"=>"主题",
        "embedded_description"=>"说明","embedded_keywords"=>"关键词","software_family"=>"制作软件",
        "capture_device"=>"拍摄设备","media_title"=>"媒体标题","media_artist"=>"艺术家","media_album"=>"专辑",
        "font_family"=>"字体名称","font_style"=>"字体样式",_=>"内容"};
}
