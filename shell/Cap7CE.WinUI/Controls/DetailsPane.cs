using Cap7CE.WinUI.Localization;
using Cap7CE.WinUI.Models;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Microsoft.UI.Xaml.Hosting;
using Microsoft.UI.Composition;
using System.Numerics;
using Windows.Storage;
namespace Cap7CE.WinUI.Controls;
internal sealed class DetailsPane : UserControl
{
    private const double FilePreviewHeight=200;
    private readonly ShellServices services;
    private readonly FileCommands commands;
    private readonly StackPanel column=new(){Spacing=8,Padding=new(12)};
    private readonly Image image=new(){Stretch=Stretch.Uniform,HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center,MaxHeight=FilePreviewHeight};
    private CompositionRoundedRectangleGeometry? previewClip;
    private readonly AssetPlaceholderIcon icon=new(){Width=72,Height=72,HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center};
    private readonly Border visual=new(){Height=FilePreviewHeight,CornerRadius=new(8)};
    private TextBlock? dimensions;
    private readonly DetailsKeywordEditor keywords;
    private readonly DetailsEmbeddedMetadata embedded;
    private readonly DispatcherTimer debounce=new(){Interval=TimeSpan.FromMilliseconds(160)};
    private CancellationTokenSource reading=new();
    private IReadOnlyList<AssetItem> selected=[];
    private (string Path,long? Count,bool Searching,int Filters,int Loaded,bool Busy) context=("",0,false,0,0,false);
    private bool stopped,keywordRefreshPending;
    public DetailsPane(ShellServices services,FileCommands commands,Action<UiMessage> notice,Action openIndex)
    {
        this.services=services;this.commands=commands;embedded=new(services);
        var keywordService=new KeywordSelectionService(services);
        keywords=new(keywordService.ReadAsync,keywordService.SaveAsync,notice,items=>commands.Run(()=>{commands.AutoKeywords(items);return Task.CompletedTask;}),unavailable:items=>commands.KeywordsUnavailable(items),openIndex:openIndex);
        var preview=new Grid();preview.Children.Add(icon);preview.Children.Add(image);visual.Child=preview;
        image.SizeChanged+=(_,_)=>UpdatePreviewClip();
        var scroll=new ScrollViewer{Content=column,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled};
        IdleScrollBars.Attach(scroll);Content=scroll;
        debounce.Tick+=(_,_)=>{debounce.Stop();if(selected.Any(item=>!item.Entry.IsDirectory))_=keywords.ReadAsync();if(selected is [var item]&&!item.Entry.IsDirectory){_=ReadVisualAsync(item,reading.Token);_=ReadDimensionsAsync(item,reading.Token);_=embedded.ReadAsync(item,reading.Token);}};
        Unloaded+=(_,_)=>Stop();Render();
    }
    public void SetContext(string path,long? count,bool searching,int filters,int loaded,bool busy)
    {
        var next=(path,count,searching,filters,loaded,busy);if(context==next)return;context=next;
        if(selected.Count==0)Render();
    }
    public void Select(IReadOnlyList<AssetItem> items)
    {
        if(!stopped&&selected.SequenceEqual(items))return;
        debounce.Stop();reading.Cancel();reading.Dispose();reading=new();stopped=false;
        selected=items.ToArray();image.Source=null;icon.Visibility=Visibility.Visible;L.Literal(visual,ToolTipService.ToolTipProperty,null);
        keywordRefreshPending=false;keywords.SetItems(selected);embedded.Reset();
        Render();
        if(selected.Any(item=>!item.Entry.IsDirectory))debounce.Start();
    }
    public void RefreshKeywordAvailability(){if(!stopped)keywords.RefreshAvailability();}
    public void EditKeywords(IReadOnlyList<AssetItem> items){Select(items);keywords.RequestEdit();}
    public void RefreshKeywords(AssetItem item)=>RefreshKeywords([item]);
    public void RefreshKeywords(IReadOnlyList<AssetItem> items){if(stopped||!selected.Any(current=>items.Any(item=>string.Equals(current.FullPath,item.FullPath,StringComparison.OrdinalIgnoreCase))))return;if(services.AutoKeywords.Busy)keywordRefreshPending=true;else _=keywords.ReadAsync();}
    public void SetAutoKeywordBusy(bool value){keywords.SetAutomaticBusy(value);if(!value&&keywordRefreshPending&&!stopped){keywordRefreshPending=false;_=keywords.ReadAsync();}}
    private void Render()
    {
        dimensions=null;column.Children.Clear();var item=selected.Count==1?selected[0]:null;
        var drive=item is not null&&IsDrive(item);
        string? headingKey=item is null?(selected.Count>0?"ui.details.multiple":context.Searching?"ui.details.search":context.Path.Length==0?"main.home":null)
            :item.Entry.IsDirectory?(drive?"ui.details.drive":"main.folder"):item.Entry.Extension.Length==0?"ui.details.file":null;
        var heading=new TextBlock{Style=(Style)Application.Current.Resources["CapDetailsHeading"]};
        if(headingKey=="main.home")L.Message(heading,TextBlock.TextProperty,LocationText.Computer);
        else if(headingKey is not null)L.Bind(heading,TextBlock.TextProperty,headingKey);
        else heading.Text=item is null?LocationName(context.Path):item.Entry.Extension.TrimStart('.').ToUpperInvariant();
        column.Children.Add(heading);
        if(item is not null){icon.SetIcon(item.IconName);visual.Height=item.Entry.IsDirectory?120:FilePreviewHeight;column.Children.Add(visual);RenderItem(item,drive);}
        else if(selected.Count>1)RenderSelection();
        else RenderContext();
    }
    private void RenderContext()
    {
        var card=context.Path.Length==0?Card(LocationText.Computer):Card(LocationName(context.Path));
        var locationLabel=context.Searching?"ui.details.searchScope":"ui.details.location";
        if(context.Path.Length==0)L.Message(card.Field(locationLabel,"",true),TextBlock.TextProperty,LocationText.Computer);else card.Field(locationLabel,context.Path,true);
        IReadOnlyDictionary<string,object?> Count()=>new Dictionary<string,object?>{{"count",context.Count}};
        // Show only an existing total; pagination progress is not a directory count.
        if(context.Searching){
            card.FieldResource("ui.details.filters","ui.details.items",()=>new Dictionary<string,object?>{{"count",context.Filters}});
            if(context.Count is not null)card.FieldResource("ui.details.matches","ui.details.items",Count);
        }
        else if(context.Path.Length==0)card.FieldResource("ui.details.browseScope","ui.details.systemLocations");
        else if(context.Count is not null)card.FieldResource("ui.details.currentItems","ui.details.items",Count);
    }
    private void RenderItem(AssetItem item,bool drive)
    {
        var card=item.Entry.IsDirectory?Card(item.Name):Card("ui.details.fileInfo",true);
        if(!item.Entry.IsDirectory) {
            card.Body.Children.Add(new TextBlock{Text=item.Name,TextWrapping=TextWrapping.Wrap,FontWeight=Microsoft.UI.Text.FontWeights.SemiBold,IsTextSelectionEnabled=true});
        }
        if(!item.Entry.IsDirectory&&FormatRegistry.ExtractorExtensions("image-dimensions").Contains(item.Entry.Extension,StringComparer.OrdinalIgnoreCase))
            dimensions=card.Field("ui.details.imageDimensions","—");
        if(!drive){if(item.Entry.IsDirectory)card.FieldResource("ui.details.size","ui.details.notCalculated");else card.Field("ui.details.fileSize",DetailsCard.Bytes(item.Entry.SizeBytes));}
        card.Field("ui.details.modified",item.ModifiedLabel);
        card.Field("ui.details.location",item.FullPath,true,()=>commands.Run(()=>{
            if(item.Entry.IsDirectory)FileCommands.OpenDirectoryInExplorer(item.FullPath);else commands.Reveal(item);
            return Task.CompletedTask;
        }));
        if(!item.Entry.IsDirectory) {
            column.Children.Add(keywords);
            column.Children.Add(embedded);
        }
    }
    private void RenderSelection()
    {
        var files=selected.Where(item=>!item.Entry.IsDirectory).ToArray();var drives=selected.Count(IsDrive);
        var card=Card("ui.details.selected",true,()=>new Dictionary<string,object?>{{"count",selected.Count}});
        card.FieldResource("ui.details.file","ui.details.items",()=>new Dictionary<string,object?>{{"count",files.Length}});card.FieldResource("main.folder","ui.details.items",()=>new Dictionary<string,object?>{{"count",selected.Count-files.Length-drives}});
        if(drives>0)card.FieldResource("ui.details.drive","ui.details.items",()=>new Dictionary<string,object?>{{"count",drives}});
        if(files.Length>0) {
            card.Field("ui.details.knownSize",DetailsCard.Bytes(files.Sum(item=>(decimal)(item.Entry.SizeBytes??0))));
            var unknown=files.Count(item=>item.Entry.SizeBytes is null);if(unknown>0)card.Body.Children.Add(L.Text("ui.details.unknownSizes",true,()=>new Dictionary<string,object?>{{"count",unknown}}));
            column.Children.Add(keywords);
        }
    }
    private DetailsCard Card(string title,bool localized=false,Func<IReadOnlyDictionary<string,object?>?>? parameters=null){var card=new DetailsCard(title,localized,parameters);column.Children.Add(card);return card;}
    private DetailsCard Card(UiMessage title){var card=new DetailsCard(title);column.Children.Add(card);return card;}
    private static string LocationName(string path){var name=SystemLocations.Current.NameForPath(path)??Path.GetFileName(path.TrimEnd('\\','/'));return path.Length==0?"":name.Length>0?name:path.TrimEnd('\\','/');}
    private static bool IsDrive(AssetItem item)=>item.Entry.IsDirectory&&string.Equals(Path.GetPathRoot(item.FullPath),item.FullPath,StringComparison.OrdinalIgnoreCase);
    private async Task ReadDimensionsAsync(AssetItem item,CancellationToken token)
    {
        var field=dimensions;if(field is null)return;
        try {
            var size=await services.Visuals.ReadDimensionsAsync(item.FullPath,token);
            if(!token.IsCancellationRequested&&ReferenceEquals(field,dimensions)&&selected is [var current]&&current==item&&size is {} value)
                L.Bind(field,TextBlock.TextProperty,"ui.details.pixelDimensions",()=>new Dictionary<string,object?>{{"width",value.Width},{"height",value.Height}});
        }catch(OperationCanceledException){}catch(Exception){ /* Keep unavailable source dimensions unknown. */ }
    }
    private async Task ReadVisualAsync(AssetItem item,CancellationToken token)
    {
        try {
            var prepared=await services.Visuals.PrepareAsync(item.FullPath,true,token);token.ThrowIfCancellationRequested();
            var bitmap=await CachedBitmapLoader.LoadAsync(image,prepared,600,token);
            if(!token.IsCancellationRequested&&selected is [var current]&&current==item){image.Source=bitmap;icon.Visibility=Visibility.Collapsed;}
        }
        catch(OperationCanceledException){}
        catch(Exception){if(!token.IsCancellationRequested)L.Bind(visual,ToolTipService.ToolTipProperty,"ui.details.previewUnavailable");}
    }
    private void UpdatePreviewClip()
    {
        if(image.ActualWidth<=0||image.ActualHeight<=0)return;
        if(previewClip is null) {
            var element=ElementCompositionPreview.GetElementVisual(image);
            previewClip=element.Compositor.CreateRoundedRectangleGeometry();previewClip.CornerRadius=new Vector2(8);
            element.Clip=element.Compositor.CreateGeometricClip(previewClip);
        }
        previewClip.Size=new Vector2((float)image.ActualWidth,(float)image.ActualHeight);
    }
    public void Stop(){stopped=true;debounce.Stop();reading.Cancel();keywords.Stop();image.Source=null;}
}
