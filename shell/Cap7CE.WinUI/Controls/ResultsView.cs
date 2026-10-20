using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Markup;
using Microsoft.UI.Xaml.Data;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;
using Windows.ApplicationModel.DataTransfer;

namespace Cap7CE.WinUI.Controls;
internal sealed class ResultsView : UserControl
{
    private readonly GridView grid = new() { SelectionMode = ListViewSelectionMode.Extended, CanDragItems = true };
    private readonly ListView list = new() { SelectionMode = ListViewSelectionMode.Extended, CanDragItems = true };
    private readonly TextBlock empty = Ui.Text("正在连接现有目录…", true);
    private readonly Grid root = new();
    private readonly ResultsGallery gallery=new(){Visibility=Visibility.Collapsed};
    private readonly StackPanel emptyPanel=new(){Spacing=8,HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center,MaxWidth=380,Margin=new(16)};
    private readonly TextBlock emptyHint=Ui.Text("",true);
    private readonly Button retry=Ui.Button("重新加载",()=>{}),clearFilters=Ui.Button("清除筛选",()=>{});
    private bool square=true,home,suspended;
    private bool IsGallery=>!square&&!listMode&&!horizontal&&!home;
    public event Action? Retry,ClearFilters;
    private FileCommands? commands;
    private AssetCollection? items;
    private bool listMode;
    private bool horizontal;
    private readonly ResultsGridLayout gridLayout;
    private ListViewBase ActiveView => listMode && !horizontal ? list : grid;
    public event Action<IReadOnlyList<AssetItem>>? SelectionChanged;
    public IReadOnlyList<AssetItem> Selection => IsGallery?gallery.Selection:ActiveView.SelectedItems.OfType<AssetItem>().ToArray();
    public ResultsView()
    {
        grid.ItemsPanel = (ItemsPanelTemplate)XamlReader.Load("<ItemsPanelTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation'><ItemsWrapGrid Orientation='Horizontal' CacheLength='1'/></ItemsPanelTemplate>");
        grid.ItemTemplate = (DataTemplate)Application.Current.Resources["CapAssetTileTemplate"];
        grid.ItemContainerStyle=(Style)Application.Current.Resources["CapResultItem"];grid.Padding=new(6);
        grid.GroupStyle.Add(new GroupStyle{HeaderTemplate=(DataTemplate)XamlReader.Load("<DataTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation'><TextBlock Text='{Binding Title}' FontSize='12' Opacity='0.6' Margin='8,8,0,4'/></DataTemplate>")});
        gridLayout = new(grid);
        list.ItemTemplate = (DataTemplate)XamlReader.Load("<DataTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation'><StackPanel Orientation='Horizontal' Spacing='18' Padding='6'><FontIcon Glyph='&#xE8A5;' FontSize='16'/><TextBlock Text='{Binding Name}' Width='300' TextTrimming='CharacterEllipsis'/><TextBlock Text='{Binding SizeLabel}' Width='90'/><TextBlock Text='{Binding ModifiedLabel}' Width='150'/><TextBlock Text='{Binding FullPath}' Opacity='0.55' TextTrimming='CharacterEllipsis'/></StackPanel></DataTemplate>");
        foreach (var view in new ListViewBase[] { grid, list })
        {
            view.SelectionChanged += (_, _) => SelectionChanged?.Invoke(Selection);
            view.DoubleTapped += OnItemDoubleTapped; view.RightTapped += Context;
            view.DragItemsStarting += OnItemsDragStarting; root.Children.Add(view);
        }
        list.Visibility=Visibility.Collapsed;root.Children.Add(gallery);gallery.SelectionChanged+=()=>{if(IsGallery)SelectionChanged?.Invoke(Selection);};
        empty.HorizontalTextAlignment=TextAlignment.Center;emptyHint.HorizontalTextAlignment=TextAlignment.Center;
        retry.Click+=(_,_)=>Retry?.Invoke();clearFilters.Click+=(_,_)=>ClearFilters?.Invoke();emptyPanel.Children.Add(empty);emptyPanel.Children.Add(emptyHint);emptyPanel.Children.Add(Ui.Row(retry,clearFilters));root.Children.Add(emptyPanel);
        root.Background=new Microsoft.UI.Xaml.Media.SolidColorBrush(Microsoft.UI.Colors.Transparent);
        root.AddHandler(UIElement.TappedEvent,new TappedEventHandler((_,e)=>{if(IsBlank(e.OriginalSource as DependencyObject))ClearSelection();}),true);Content=root;
    }
    public void Configure(FileCommands value){commands=value;gallery.Configure(value);}
    public void Bind(AssetCollection value,bool isHome=false,bool busy=false,string? error=null,bool filtered=false)
    {
        if(!ReferenceEquals(items,value)||home!=isHome) {
            var wasGallery=IsGallery;home=isHome;items=value;
            SetGridSource();
            list.ItemsSource=value;gallery.Bind(value);ApplyView(ActiveView,wasGallery);SelectionChanged?.Invoke([]);
        }
        emptyPanel.Visibility=value.Count==0?Visibility.Visible:Visibility.Collapsed;
        empty.Text=busy?"正在载入…":error is not null?"无法读取当前位置":"没有匹配项";
        emptyHint.Text=error??(filtered?"可以调整搜索词或筛选条件后重试。":"此文件夹中没有可显示的内容。");
        retry.Visibility=!busy?Visibility.Visible:Visibility.Collapsed;clearFilters.Visibility=!busy&&filtered?Visibility.Visible:Visibility.Collapsed;
    }
    public void View(bool isList){var previous=ActiveView;var old=IsGallery;listMode=isList;ApplyView(previous,old);gridLayout.SetHorizontal(horizontal);}
    public void Preferences(ShellPreferences value){var previous=ActiveView;var old=IsGallery;square=value.SquareTiles;gallery.Size(value.TileSize);ApplyView(previous,old);}
    public void PreviewSize(double value)=>gallery.Size(value);
    public void SetHorizontal(bool value)
    {
        if(horizontal==value)return;
        var previous=ActiveView;var old=IsGallery;var selected=Selection;horizontal=value;
        if(home){SetGridSource();foreach(var item in selected)if(items?.Contains(item)==true)grid.SelectedItems.Add(item);}
        ApplyView(previous,old);gridLayout.SetHorizontal(value);
    }
    private void SetGridSource()
    {grid.ItemsSource=home&&!horizontal&&items is {} value?new CollectionViewSource{IsSourceGrouped=true,Source=new[]{new HomeGroup("系统目录",value.Where(i=>i.Entry.Id.StartsWith("home-"))),new HomeGroup("此电脑",value.Where(i=>!i.Entry.Id.StartsWith("home-")))}}.View:items;}
    private void ApplyView(ListViewBase previous,bool wasGallery)
    {
        var current=ActiveView;
        if(!ReferenceEquals(previous,current)||wasGallery!=IsGallery)
        {
            var selected=wasGallery?gallery.Selection:previous.SelectedItems.OfType<AssetItem>().ToArray();
            if(IsGallery)gallery.ReplaceSelection(selected);else {current.SelectedItems.Clear();foreach(var item in selected)if(items?.Contains(item)==true)current.SelectedItems.Add(item);}
        }
        grid.Visibility=!IsGallery&&ReferenceEquals(current,grid)?Visibility.Visible:Visibility.Collapsed;
        list.Visibility=!IsGallery&&ReferenceEquals(current,list)?Visibility.Visible:Visibility.Collapsed;gallery.Visibility=IsGallery?Visibility.Visible:Visibility.Collapsed;
        Suspend(suspended);
        if(!ReferenceEquals(previous,current)||wasGallery!=IsGallery)SelectionChanged?.Invoke(Selection);
    }
    public void SelectAll(){if(IsGallery)gallery.SelectAll();else ActiveView.SelectAll();}
    public void ClearSelection(){if(IsGallery)gallery.Clear();else ActiveView.SelectedItems.Clear();}
    private bool IsBlank(DependencyObject? element)
    {for(var item=element;item is not null&&!ReferenceEquals(item,root);item=Microsoft.UI.Xaml.Media.VisualTreeHelper.GetParent(item))if(item is ListViewItem or GridViewItem or GalleryTile or Button or Microsoft.UI.Xaml.Controls.Primitives.ScrollBar)return false;return true;}
    public void Suspend(bool value){suspended=value;foreach(var tile in Tiles(grid))tile.Suspend(value||grid.Visibility!=Visibility.Visible);gallery.Suspend(value||!IsGallery);}
    private void OnItemDoubleTapped(object sender, DoubleTappedRoutedEventArgs e)
    {
        if ((e.OriginalSource as FrameworkElement)?.DataContext is not AssetItem item || commands is null) return;
        commands.Run(() => { if (item.Entry.IsDirectory) commands.Open(item); else commands.Preview(item); return Task.CompletedTask; });
    }
    private void Context(object sender, RightTappedRoutedEventArgs e)
    {
        if (commands is null || (e.OriginalSource as FrameworkElement)?.DataContext is not AssetItem item) return;
        e.Handled = true; var view = (ListViewBase)sender;
        if (!view.SelectedItems.Contains(item)) { view.SelectedItems.Clear(); view.SelectedItem = item; }
        commands.Menu(Selection).ShowAt(view, new Microsoft.UI.Xaml.Controls.Primitives.FlyoutShowOptions { Position = e.GetPosition(view) });
    }
    private void OnItemsDragStarting(object sender, DragItemsStartingEventArgs e)
    {
        ResultDrag.Prepare(e.Data,e.Items.OfType<AssetItem>().ToArray(),()=>e.Cancel=true);
    }
    private static IEnumerable<AssetTile> Tiles(DependencyObject parent)
    {
        for (var i = 0; i < Microsoft.UI.Xaml.Media.VisualTreeHelper.GetChildrenCount(parent); i++)
        {
            var child = Microsoft.UI.Xaml.Media.VisualTreeHelper.GetChild(parent,i);
            if (child is AssetTile tile) yield return tile; else foreach (var nested in Tiles(child)) yield return nested;
        }
    }
}
