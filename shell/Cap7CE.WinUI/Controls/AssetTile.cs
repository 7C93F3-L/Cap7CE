using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Microsoft.UI.Xaml.Hosting;
using Microsoft.UI.Composition;
using System.Numerics;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Windows.Storage;
namespace Cap7CE.WinUI.Controls;
public sealed class AssetTile : Grid
{
    private readonly Image image=new(){Stretch=Stretch.Uniform};
    private readonly AssetPlaceholderIcon formatIcon=new(){Width=44,Height=44};
    private readonly TextBlock title=new(){TextTrimming=TextTrimming.CharacterEllipsis,Margin=new(6),MaxLines=2,HorizontalTextAlignment=TextAlignment.Center};
    private readonly Border caption=new(),captionSelected=new(),restStroke=new(),hover=new(),selected=new();
    private readonly ResultCardInteraction interaction;
    private CompositionRoundedRectangleGeometry? clipGeometry;
    private CancellationTokenSource? reading;
    private bool active,suspended;
    private double? compactHeight;
    private (double Width,double Height)? galleryBounds;
    private static ShellPreferences preferences=new();
    private static event Action? LayoutChanged;
    internal static VisualConnection? Visuals {get;set;}
    internal static void Configure(ShellPreferences value){preferences=value;LayoutChanged?.Invoke();}
    public AssetTile()
    {
        Background=new SolidColorBrush(Microsoft.UI.Colors.Transparent);
        interaction=new(this);RowDefinitions.Add(new());RowDefinitions.Add(new(){Height=new(28)});
        var surface=new Border {Style=(Style)Application.Current.Resources["CapResultSurface"],IsHitTestVisible=false};SetRowSpan(surface,2);Children.Add(surface);
        Children.Add(formatIcon);Children.Add(image);
        caption.Style=(Style)Application.Current.Resources["CapResultCaption"];captionSelected.Style=(Style)Application.Current.Resources["CapResultCaptionSelected"];
        foreach(var border in new[]{caption,captionSelected}){border.IsHitTestVisible=false;SetRow(border,1);Children.Add(border);}
        title.Style=(Style)Application.Current.Resources["CapResultTitle"];SetRow(title,1);Children.Add(title);
        restStroke.Style=(Style)Application.Current.Resources["CapResultRestStroke"];
        hover.Style=(Style)Application.Current.Resources["CapResultHover"];selected.Style=(Style)Application.Current.Resources["CapResultSelected"];
        foreach(var border in new[]{restStroke,hover,selected}){border.IsHitTestVisible=false;SetRowSpan(border,2);Children.Add(border);}
        SetCardState(false,false);SizeChanged+=(_,_)=>UpdateClip();
        DataContextChanged+=(_,_)=>Refresh();Loaded+=(_,_)=>{active=!suspended;LayoutChanged+=Layout;Layout();UpdateClip();interaction.Connect();Refresh();};
        Unloaded+=(_,_)=>{active=false;interaction.Disconnect();LayoutChanged-=Layout;Release();};Layout();
    }
    internal static double PreferredSize => preferences.TileSize;
    internal void SetGalleryBounds(double width,double height){galleryBounds=(width,height);Layout();}
    internal void SetCompactHeight(double? height) { if(compactHeight==height)return;compactHeight=height;Layout(); }
    private void Layout()
    {
        Width=galleryBounds?.Width??compactHeight??preferences.TileSize;Height=galleryBounds?.Height??compactHeight??(preferences.TileSize+28);
        Padding=new(0);RowDefinitions[0].Height=galleryBounds is {} bounds?new(Math.Max(1,bounds.Height-28)):compactHeight is null?new(preferences.TileSize):new(1,GridUnitType.Star);
        title.Visibility=compactHeight is <52?Visibility.Collapsed:Visibility.Visible;title.MaxLines=compactHeight is null?2:1;
        RowDefinitions[1].Height=new(title.Visibility==Visibility.Visible?28:0);
        caption.Visibility=title.Visibility;
        formatIcon.Width=formatIcon.Height=compactHeight is {} cell?Math.Clamp(cell-(cell<52?12:40),1,44):44;
        image.Stretch=galleryBounds is not null?Stretch.Uniform:preferences.SquareTiles?Stretch.UniformToFill:Stretch.Uniform;title.FontSize=preferences.FontSize;
        title.MaxLines=1;title.Margin=new(4,3,4,3);title.VerticalAlignment=VerticalAlignment.Center;
    }
    internal void SetCardState(bool isSelected,bool isHovered)
    {
        title.Style=(Style)Application.Current.Resources[isSelected?"CapResultTitleSelected":"CapResultTitle"];
        restStroke.Visibility=!isSelected&&!isHovered?Visibility.Visible:Visibility.Collapsed;
        selected.Visibility=isSelected?Visibility.Visible:Visibility.Collapsed;
        hover.Visibility=isHovered&&!isSelected?Visibility.Visible:Visibility.Collapsed;
        captionSelected.Visibility=isSelected?Visibility.Visible:Visibility.Collapsed;
    }
    private void UpdateClip()
    {
        if(ActualWidth<=0||ActualHeight<=0)return;
        if(clipGeometry is null){var visual=ElementCompositionPreview.GetElementVisual(this);clipGeometry=visual.Compositor.CreateRoundedRectangleGeometry();visual.Clip=visual.Compositor.CreateGeometricClip(clipGeometry);}
        clipGeometry.Size=new((float)ActualWidth,(float)ActualHeight);var radius=(float)Math.Min(8,Math.Min(ActualWidth,ActualHeight)/2);clipGeometry.CornerRadius=new(radius,radius);
    }
    internal void Suspend(bool value){if(suspended==value)return;suspended=value;active=IsLoaded&&!value;if(value)Release();else if(active)Refresh();}
    private void Release(){reading?.Cancel();reading?.Dispose();reading=null;image.Source=null;}
    private async void Refresh()
    {
        interaction.ClearHover();Release();formatIcon.Visibility=Visibility.Visible;if(DataContext is not AssetItem item)return;
        title.Text=item.Name;ToolTipService.SetToolTip(this,item.FullPath);
        var icon=item.IconName;
        formatIcon.SetIcon(icon);
        if(!active||item.FullPath.Length==0||item.Entry.IsDirectory||Visuals is null)return;
        var token=(reading=new()).Token;
        try
        {
            var path=await Visuals.PrepareAsync(item.FullPath,false,token);token.ThrowIfCancellationRequested();
            var file=await StorageFile.GetFileFromPathAsync(path);using var stream=await file.OpenReadAsync();
            var bitmap=new BitmapImage{DecodePixelWidth=480};await bitmap.SetSourceAsync(stream);
            if(!token.IsCancellationRequested&&ReferenceEquals(DataContext,item)){image.Source=bitmap;formatIcon.Visibility=Visibility.Collapsed;item.ReportAspect(bitmap.PixelWidth,bitmap.PixelHeight);}
        }
        catch(OperationCanceledException){}catch{}
    }
}
