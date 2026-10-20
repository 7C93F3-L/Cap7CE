using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Windows.Storage;
namespace Cap7CE.WinUI.Controls;
public sealed class AssetTile : Grid
{
    private readonly Image image=new(){Stretch=Stretch.Uniform};
    private readonly Image formatIcon=new(){Width=44,Height=44,Stretch=Stretch.Uniform,Opacity=.85};
    private readonly TextBlock title=new(){TextTrimming=TextTrimming.CharacterEllipsis,Margin=new(6),MaxLines=2,HorizontalTextAlignment=TextAlignment.Center};
    private CancellationTokenSource? reading;
    private bool active;
    private double? compactHeight;
    private static ShellPreferences preferences=new();
    private static event Action? LayoutChanged;
    internal static VisualConnection? Visuals {get;set;}
    internal static void Configure(ShellPreferences value){preferences=value;LayoutChanged?.Invoke();}
    public AssetTile()
    {
        Padding=new(6);RowDefinitions.Add(new());RowDefinitions.Add(new(){Height=GridLength.Auto});Children.Add(formatIcon);Children.Add(image);SetRow(title,1);Children.Add(title);
        DataContextChanged+=(_,_)=>Refresh();Loaded+=(_,_)=>{active=true;LayoutChanged+=Layout;Layout();Refresh();};
        Unloaded+=(_,_)=>{active=false;LayoutChanged-=Layout;Release();};Layout();
    }
    internal static double PreferredSize => preferences.TileSize;
    internal void SetCompactHeight(double? height) { if(compactHeight==height)return;compactHeight=height;Layout(); }
    private void Layout()
    {
        Width=compactHeight??preferences.TileSize;Height=compactHeight??(preferences.TileSize+28);
        RowDefinitions[0].Height=compactHeight is null?new(preferences.TileSize-10):new(1,GridUnitType.Star);
        title.Visibility=compactHeight is <52?Visibility.Collapsed:Visibility.Visible;title.MaxLines=compactHeight is null?2:1;
        formatIcon.Width=formatIcon.Height=compactHeight is {} cell?Math.Clamp(cell-(cell<52?12:40),1,44):44;
        image.Stretch=preferences.SquareTiles?Stretch.UniformToFill:Stretch.Uniform;title.FontSize=preferences.FontSize;
    }
    internal void Suspend(bool suspended){active=!suspended;if(suspended)Release();else Refresh();}
    private void Release(){reading?.Cancel();reading?.Dispose();reading=null;image.Source=null;}
    private async void Refresh()
    {
        Release();if(DataContext is not AssetItem item)return;
        title.Text=item.Name;ToolTipService.SetToolTip(this,item.FullPath);
        var icon=item.Entry.IsDirectory?(item.FullPath.Length<=3?"skim-disk":"skim-folder"):FormatRegistry.Find(item.Entry.Extension)?.IconName??"skim-file";
        formatIcon.Source=new SvgImageSource(new Uri("ms-appx:///Assets/Icons/"+icon+".svg"));
        if(!active||item.FullPath.Length==0||item.Entry.IsDirectory||Visuals is null)return;
        var token=(reading=new()).Token;
        try
        {
            var path=await Visuals.PrepareAsync(item.FullPath,false,token);token.ThrowIfCancellationRequested();
            var file=await StorageFile.GetFileFromPathAsync(path);using var stream=await file.OpenReadAsync();
            var bitmap=new BitmapImage{DecodePixelWidth=480};await bitmap.SetSourceAsync(stream);
            if(!token.IsCancellationRequested&&ReferenceEquals(DataContext,item))image.Source=bitmap;
        }
        catch(OperationCanceledException){}catch{}
    }
}
