using Cap7CE.WinUI.Models;
using L=Cap7CE.WinUI.Localization.LanguageUi;
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
    private readonly DetailsCard card=new("ui.embedded.embedded",true);
    private StackPanel Body=>card.Body;
    private long revision;
    private readonly DispatcherTimer copyFeedback=new(){Interval=TimeSpan.FromSeconds(1.5)};
    private Button? copyButton;
    public DetailsEmbeddedMetadata(ShellServices services)
    {
        this.services=services;Content=card;
        copyFeedback.Tick+=(_,_)=>{copyFeedback.Stop();if(copyButton is not null)L.Bind(copyButton,Button.ContentProperty,"ui.embedded.copy");};
        Unloaded+=(_,_)=>copyFeedback.Stop();
    }
    public void Reset()
    {
        revision++;
        Clear();Body.Children.Add(L.Text("ui.keywords.reading",true));
    }
    private void Clear(){copyFeedback.Stop();copyButton=null;while(Body.Children.Count>1)Body.Children.RemoveAt(1);}
    private void AddCopy(string text)
    {
        var button=L.Button("ui.embedded.copy",()=>{});
        button.FontSize=12;button.MinWidth=0;button.Padding=new(8,4,8,4);button.HorizontalAlignment=HorizontalAlignment.Right;
        button.Click+=(_,_)=>{
            copyFeedback.Stop();
            try{var data=new DataPackage();data.SetText(text);Clipboard.SetContent(data);L.Bind(button,Button.ContentProperty,"ui.embedded.copied");}
            catch(Exception){L.Bind(button,Button.ContentProperty,"ui.embedded.copyFailed");}
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
            // Path attributes and identity checks may wait on the filesystem.
            var hasStoredMetadata=await Task.Run(()=>{
                timeout.Token.ThrowIfCancellationRequested();
                FileAccessGuard.Validate(item);
                timeout.Token.ThrowIfCancellationRequested();
                return File.Exists(Path.Combine(PreferenceStore.ProductData,"index","cap7ce-index.db"));
            },timeout.Token);
            timeout.Token.ThrowIfCancellationRequested();if(expected!=revision)return;
            JsonElement metadata=default;
            if(item.Entry.SizeBytes is {} size&&item.Entry.ModifiedUtcTicks is {} ticks
                &&hasStoredMetadata) {
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
                        if(!string.IsNullOrWhiteSpace(text)){card.Field(LabelKey(kind),text,true);if(kind=="visual_content")AddCopy(text);}
                    }
                if(metadata.TryGetProperty("capturedAt",out var captured)&&captured.ValueKind==JsonValueKind.String
                    &&DateTimeOffset.TryParse(captured.GetString(),out var date))card.FieldResource("ui.embedded.captured","ui.embedded.date",()=>new Dictionary<string,object?>{{"value",date.LocalDateTime}},fullWidth:true);
            }
            if(Body.Children.Count==1)Body.Children.Add(L.Text("ui.embedded.none",true));
        }catch(OperationCanceledException){if(!token.IsCancellationRequested&&expected==revision){Clear();Body.Children.Add(L.Text("ui.embedded.timeout",true));}}
        catch(Exception error){if(!token.IsCancellationRequested&&expected==revision){Clear();Body.Children.Add(L.Text("ui.embedded.unavailable",true));NativeDiagnostics.VisualFailure(error);}}
        finally {
            if(timeout.IsCancellationRequested)try{await services.StoredMetadata.RequestAsync("cancelPreviewMetadata",[id]);}catch(Exception){}
        }
    }
    private static string LabelKey(string? kind)=>kind switch {
        "visual_content"=>"ui.embedded.prompt","embedded_title"=>"ui.embedded.title","embedded_subject"=>"ui.embedded.subject",
        "embedded_description"=>"ui.embedded.description","embedded_keywords"=>"ui.embedded.keywords","software_family"=>"ui.embedded.software",
        "capture_device"=>"ui.embedded.device","media_title"=>"ui.embedded.mediaTitle","media_artist"=>"ui.embedded.artist","media_album"=>"ui.embedded.album",
        "font_family"=>"ui.embedded.fontFamily","font_style"=>"ui.embedded.fontStyle",_=>"ui.embedded.content"};
}
