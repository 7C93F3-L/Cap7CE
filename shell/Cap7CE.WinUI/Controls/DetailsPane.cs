using Cap7CE.WinUI.Models;
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
    private readonly ShellServices services;
    private readonly FileCommands commands;
    private readonly StackPanel column=new(){Spacing=8,Padding=new(12)};
    private readonly Image image=new(){Stretch=Stretch.Uniform,HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center,MaxHeight=160};
    private CompositionRoundedRectangleGeometry? previewClip;
    private readonly AssetPlaceholderIcon icon=new(){Width=72,Height=72,HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center};
    private readonly Border visual=new(){Height=160,CornerRadius=new(8)};
    private readonly DetailsKeywordEditor keywords;
    private readonly DispatcherTimer debounce=new(){Interval=TimeSpan.FromMilliseconds(160)};
    private CancellationTokenSource reading=new();
    private IReadOnlyList<AssetItem> selected=[];
    private (string Path,long? Count,bool Searching,int Filters) context=("",0,false,0);
    private bool stopped;
    public DetailsPane(ShellServices services,FileCommands commands,Action<string> notice)
    {
        this.services=services;this.commands=commands;
        var keywordService=new ManualKeywordService(services);
        keywords=new(keywordService.ReadAsync,keywordService.SaveAsync,notice,item=>commands.Run(()=>{commands.AutoKeywords([item]);return Task.CompletedTask;}));
        var preview=new Grid();preview.Children.Add(icon);preview.Children.Add(image);visual.Child=preview;
        image.SizeChanged+=(_,_)=>UpdatePreviewClip();
        var scroll=new ScrollViewer{Content=column,HorizontalScrollBarVisibility=ScrollBarVisibility.Disabled};
        IdleScrollBars.Attach(scroll);Content=scroll;
        debounce.Tick+=(_,_)=>{debounce.Stop();if(selected is [var item]&&!item.Entry.IsDirectory){_=keywords.ReadAsync();_=ReadVisualAsync(item,reading.Token);}};
        Unloaded+=(_,_)=>Stop();Render();
    }
    public void SetContext(string path,long? count,bool searching,int filters)
    {
        var next=(path,count,searching,filters);if(context==next)return;context=next;
        if(selected.Count==0)Render();
    }
    public void Select(IReadOnlyList<AssetItem> items)
    {
        if(!stopped&&selected.SequenceEqual(items))return;
        debounce.Stop();reading.Cancel();reading.Dispose();reading=new();stopped=false;
        selected=items.ToArray();image.Source=null;icon.Visibility=Visibility.Visible;ToolTipService.SetToolTip(visual,null);
        keywords.SetItem(selected is [var file]&&!file.Entry.IsDirectory?file:null);
        Render();
        if(selected is [var item]&&!item.Entry.IsDirectory)debounce.Start();
    }
    public void EditKeywords(AssetItem item){Select([item]);keywords.RequestEdit();}
    public void RefreshKeywords(AssetItem item){if(!stopped&&selected is [var current]&&string.Equals(current.FullPath,item.FullPath,StringComparison.OrdinalIgnoreCase))_=keywords.ReadAsync();}
    public void SetAutoKeywordBusy(bool value)=>keywords.SetAutomaticBusy(value);
    private void Render()
    {
        column.Children.Clear();var item=selected.Count==1?selected[0]:null;
        var drive=item is not null&&IsDrive(item);
        var heading=item is null?(selected.Count>0?"多选信息":context.Searching?"当前搜索":LocationName(context.Path))
            :item.Entry.IsDirectory?(drive?"磁盘":"文件夹"):item.Entry.Extension.TrimStart('.').ToUpperInvariant();
        if(heading.Length==0)heading="文件";
        column.Children.Add(new TextBlock{Text=heading,Style=(Style)Application.Current.Resources["CapDetailsHeading"]});
        if(item is not null){icon.SetIcon(item.IconName);visual.Height=item.Entry.IsDirectory?120:160;column.Children.Add(visual);RenderItem(item,drive);}
        else if(selected.Count>1)RenderSelection();
        else RenderContext();
    }
    private void RenderContext()
    {
        var card=Card(LocationName(context.Path));
        card.Field(context.Searching?"搜索范围":"位置",context.Path.Length==0?"此电脑":context.Path,true);
        var count=context.Count is { } total?$"{total:N0} 项":"统计中";
        if(context.Searching){card.Field("筛选条件",$"{context.Filters} 项");card.Field("匹配结果",count);}
        else card.Field(context.Path.Length==0?"浏览范围":"当前项目",context.Path.Length==0?"系统位置与本机磁盘":count);
    }
    private void RenderItem(AssetItem item,bool drive)
    {
        var card=Card(item.Entry.IsDirectory?item.Name:"文件信息");
        if(!item.Entry.IsDirectory) {
            card.Body.Children.Add(new TextBlock{Text=item.Name,TextWrapping=TextWrapping.Wrap,FontWeight=Microsoft.UI.Text.FontWeights.SemiBold,IsTextSelectionEnabled=true});
        }
        if(!drive)card.Field("大小",item.Entry.IsDirectory?"未计算":DetailsCard.Bytes(item.Entry.SizeBytes));
        card.Field("修改时间",item.ModifiedLabel);
        card.Field("位置",item.FullPath,true,()=>commands.Run(()=>{
            if(item.Entry.IsDirectory)FileCommands.OpenDirectoryInExplorer(item.FullPath);else commands.Reveal(item);
            return Task.CompletedTask;
        }));
        if(!item.Entry.IsDirectory) {
            column.Children.Add(keywords);
            Card("内嵌元数据").Body.Children.Add(Ui.Text("当前不可用",true));
        }
    }
    private void RenderSelection()
    {
        var files=selected.Where(item=>!item.Entry.IsDirectory).ToArray();var drives=selected.Count(IsDrive);
        var card=Card($"已选择 {selected.Count} 项");
        card.Field("文件",$"{files.Length} 项");card.Field("文件夹",$"{selected.Count-files.Length-drives} 项");
        if(drives>0)card.Field("磁盘",$"{drives} 项");
        if(files.Length>0) {
            card.Field("已知文件大小",DetailsCard.Bytes(files.Sum(item=>(decimal)(item.Entry.SizeBytes??0))));
            var unknown=files.Count(item=>item.Entry.SizeBytes is null);if(unknown>0)card.Body.Children.Add(Ui.Text($"另有 {unknown} 个文件大小未知",true));
            Card("添加关键词").Body.Children.Add(Ui.Text("当前不可用",true));
        }
    }
    private DetailsCard Card(string title){var card=new DetailsCard(title);column.Children.Add(card);return card;}
    private static string LocationName(string path){var name=Path.GetFileName(path.TrimEnd('\\','/'));return path.Length==0?"此电脑":name.Length>0?name:path.TrimEnd('\\','/');}
    private static bool IsDrive(AssetItem item)=>item.Entry.IsDirectory&&string.Equals(Path.GetPathRoot(item.FullPath),item.FullPath,StringComparison.OrdinalIgnoreCase);
    private async Task ReadVisualAsync(AssetItem item,CancellationToken token)
    {
        try {
            var prepared=await services.Visuals.PrepareAsync(item.FullPath,true,token);token.ThrowIfCancellationRequested();
            var bitmap=await CachedBitmapLoader.LoadAsync(image,prepared,600,token);
            if(!token.IsCancellationRequested&&selected is [var current]&&current==item){image.Source=bitmap;icon.Visibility=Visibility.Collapsed;}
        }
        catch(OperationCanceledException){}
        catch(Exception){if(!token.IsCancellationRequested)ToolTipService.SetToolTip(visual,"预览暂不可用");}
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
