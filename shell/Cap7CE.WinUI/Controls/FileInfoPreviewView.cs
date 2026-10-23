using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Storage;
using Windows.Storage.FileProperties;

namespace Cap7CE.WinUI.Controls;

// Generic presentation only; it neither extracts content nor publishes caches.
internal sealed class FileInfoPreviewView : Grid
{
    private readonly Image thumbnail=new(){Stretch=Stretch.Uniform};
    private readonly AssetPlaceholderIcon icon=new(){Width=160,Height=160,HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center};
    private readonly Grid artwork=new(){Width=280,Height=280,HorizontalAlignment=HorizontalAlignment.Center};
    private bool unloaded;
    public FileInfoPreviewView(AssetItem item,Action openExternal)
    {
        var iconName=File.Exists(Path.Combine(AppContext.BaseDirectory,"Assets","Icons",item.IconName+".svg"))?item.IconName:"skim-file";
        icon.SetIcon(iconName);artwork.Children.Add(icon);artwork.Children.Add(thumbnail);PreviewViewportStyle.Apply(artwork);
        var name=new TextBlock {Text=item.Name,FontSize=20,FontWeight=Microsoft.UI.Text.FontWeights.SemiBold,
            TextWrapping=TextWrapping.Wrap,TextAlignment=TextAlignment.Center,IsTextSelectionEnabled=true,Margin=new(0,8,0,0)};
        var type=item.Entry.IsDirectory?"文件夹":string.IsNullOrWhiteSpace(item.Entry.Extension)?"文件":item.Entry.Extension.TrimStart('.').ToUpperInvariant()+" 文件";
        var summary=Ui.Text(item.Entry.IsDirectory?type:$"{type} · {DetailsCard.Bytes(item.Entry.SizeBytes)}",true);
        summary.TextAlignment=TextAlignment.Center;summary.IsTextSelectionEnabled=true;
        var details=new Grid {RowSpacing=8,ColumnSpacing=16,HorizontalAlignment=HorizontalAlignment.Center};
        details.ColumnDefinitions.Add(new(){Width=GridLength.Auto});details.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        void Field(string label,string value) {
            var row=details.RowDefinitions.Count;details.RowDefinitions.Add(new(){Height=GridLength.Auto});
            var title=Ui.Text(label,true);title.FontSize=12;title.VerticalAlignment=VerticalAlignment.Center;
            var text=Ui.Text(value);text.FontSize=13;text.IsTextSelectionEnabled=true;
            Grid.SetRow(title,row);Grid.SetRow(text,row);Grid.SetColumn(text,1);details.Children.Add(title);details.Children.Add(text);
        }
        if(item.Entry.CreatedUtcTicks is {} created)Field("创建时间",DateTime.FromFileTimeUtc(created).ToLocalTime().ToString("yyyy-MM-dd HH:mm"));
        Field("修改时间",item.ModifiedLabel);Field("文件位置",item.FullPath);
        var open=Ui.Tool("\uE8A7","默认程序打开",openExternal);open.HorizontalAlignment=HorizontalAlignment.Center;
        var column=Ui.Column(artwork,name,summary,details,open);column.Spacing=12;column.Margin=new(56,20,56,24);
        column.MaxWidth=680;column.HorizontalAlignment=HorizontalAlignment.Center;column.VerticalAlignment=VerticalAlignment.Center;
        var scroll=new ScrollViewer {Content=column,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};
        Children.Add(scroll);IdleScrollBars.Attach(scroll);
        SizeChanged+=(_,_)=>{var size=Math.Clamp(Math.Min(ActualWidth-112,ActualHeight-250),96,280);artwork.Width=artwork.Height=size;icon.Width=icon.Height=Math.Min(160,size*.7);};
        Unloaded+=(_,_)=>{unloaded=true;thumbnail.Source=null;};
    }
    public async Task LoadAsync(AssetItem item,CancellationToken token)
    {
        if(item.Entry.IsDirectory)return;
        try {
            var file=await StorageFile.GetFileFromPathAsync(item.FullPath).AsTask(token);
            token.ThrowIfCancellationRequested();if(unloaded)return;
            using var image=await file.GetThumbnailAsync(ThumbnailMode.SingleItem,560,
                ThumbnailOptions.ReturnOnlyIfCached|ThumbnailOptions.UseCurrentScale).AsTask(token);
            token.ThrowIfCancellationRequested();if(unloaded||image is null||image.Type!=ThumbnailType.Image)return;
            var bitmap=new BitmapImage {DecodePixelWidth=560};await bitmap.SetSourceAsync(image).AsTask(token);
            token.ThrowIfCancellationRequested();if(unloaded)return;
            thumbnail.Source=bitmap;icon.Visibility=Visibility.Collapsed;
        } catch(OperationCanceledException){}catch(Exception error){if(!token.IsCancellationRequested&&!unloaded)NativeDiagnostics.VisualFailure(error);}
    }
}
