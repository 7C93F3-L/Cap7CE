using Cap7CE.WinUI.Models;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Storage;
using Windows.Storage.FileProperties;

namespace Cap7CE.WinUI.Controls;

internal sealed class AudioPreviewView : Grid
{
    private readonly Image cover=new(){Stretch=Stretch.UniformToFill};
    private readonly AssetPlaceholderIcon icon=new(){Width=160,Height=160,HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center};
    private readonly Grid artwork=new(){Width=320,Height=320,HorizontalAlignment=HorizontalAlignment.Center};
    private readonly StackPanel information=Ui.Column();
    public AudioPreviewView(AssetItem item,MediaPlayerElement player)
    {
        RowDefinitions.Add(new(){Height=new(1,GridUnitType.Star)});RowDefinitions.Add(new(){Height=GridLength.Auto});
        icon.SetIcon(item.IconName);artwork.Children.Add(icon);artwork.Children.Add(cover);PreviewViewportStyle.Apply(artwork);
        var name=new TextBlock {Text=item.Name,TextWrapping=TextWrapping.Wrap,TextAlignment=TextAlignment.Center,IsTextSelectionEnabled=true,FontSize=17,Margin=new(0,16,0,0)};
        information.HorizontalAlignment=HorizontalAlignment.Center;
        var column=Ui.Column(artwork,name,information);column.Spacing=8;column.Margin=new(24,16,24,16);column.MaxWidth=520;column.HorizontalAlignment=HorizontalAlignment.Center;column.VerticalAlignment=VerticalAlignment.Center;
        var scroll=new ScrollViewer {Content=column,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};
        Children.Add(scroll);player.Height=100;Grid.SetRow(player,1);Children.Add(player);
        SizeChanged+=(_,_)=>{var size=Math.Max(64,Math.Min(320,Math.Min(ActualWidth-64,ActualHeight-220)));artwork.Width=artwork.Height=size;icon.Width=icon.Height=Math.Min(160,size*.65);};
    }
    public async Task LoadAsync(StorageFile file,AssetItem item,ShellServices services,CancellationToken token)
    {
        await Task.WhenAll(CoverAsync(file,token),MetadataAsync(item,services,token));
    }
    private async Task CoverAsync(StorageFile file,CancellationToken token)
    {
        try {
            using var thumbnail=await file.GetThumbnailAsync(ThumbnailMode.MusicView,640,ThumbnailOptions.UseCurrentScale);
            token.ThrowIfCancellationRequested();
            if(thumbnail is null||thumbnail.Type!=ThumbnailType.Image)return;
            var bitmap=new BitmapImage();await bitmap.SetSourceAsync(thumbnail);token.ThrowIfCancellationRequested();
            cover.Source=bitmap;icon.Visibility=Visibility.Collapsed;
        } catch(OperationCanceledException){}catch(Exception error){if(!token.IsCancellationRequested)NativeDiagnostics.VisualFailure(error);}
    }
    private async Task MetadataAsync(AssetItem item,ShellServices services,CancellationToken token)
    {
        if(item.Entry.SizeBytes is not {} size||item.Entry.ModifiedUtcTicks is not {} ticks
            ||!File.Exists(Path.Combine(PreferenceStore.ProductData,"index","cap7ce-index.db")))return;
        try {
            var modified=DateTime.FromFileTimeUtc(ticks).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'",System.Globalization.CultureInfo.InvariantCulture);
            var reply=await services.StoredMetadata.RequestAsync("storedMetadata",[Guid.NewGuid().ToString(),item.FullPath,new{fileSize=size,modifiedAt=modified}],token);
            token.ThrowIfCancellationRequested();
            if(!reply.GetProperty("isCurrent").GetBoolean()||reply.GetProperty("metadata").ValueKind!=System.Text.Json.JsonValueKind.Object)return;
            foreach(var entry in reply.GetProperty("metadata").GetProperty("items").EnumerateArray()) {
                var label=entry.GetProperty("kind").GetString() switch {"media_artist"=>"ui.preview.artist","media_album"=>"ui.preview.album",_=>null};
                var value=entry.GetProperty("text").GetString();
                if(label is null||string.IsNullOrWhiteSpace(value))continue;
                var text=L.Text(label,parameters:()=>new Dictionary<string,object?>{{"value",value}});text.TextAlignment=TextAlignment.Center;text.IsTextSelectionEnabled=true;information.Children.Add(text);
            }
        } catch(OperationCanceledException){}catch(Exception error){if(!token.IsCancellationRequested)NativeDiagnostics.VisualFailure(error);}
    }
}
