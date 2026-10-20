using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Data;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Themes;

namespace Cap7CE.WinUI.Controls;
internal sealed class SidebarView : UserControl
{
    private readonly ListView favorites = new() { SelectionMode = ListViewSelectionMode.Single, IsItemClickEnabled = true,
        HorizontalContentAlignment = HorizontalAlignment.Stretch, Padding = new(0) };
    public event Action<string>? Navigate;
    public event Action? AddFavorite, Settings, ToggleFilters, ToggleDetails;
    private readonly Grid root = new(), directories = new(), heading = new();
    private readonly StackPanel brandArea;
    private readonly VariableSizedWrapGrid tools = new() { Orientation = Orientation.Horizontal, ItemWidth = 39, ItemHeight = 34, MaximumRowsOrColumns = 2 };
    private readonly TextBlock header = new() { Text = "收藏目录", FontSize = 11, VerticalAlignment = VerticalAlignment.Center, Margin = new(6,0,0,0) };
    private readonly List<(ContentControl Button, TextBlock Label, Grid Content, double Gap, bool Pill)> navigation = [];
    private readonly ToggleButton filterButton, detailsButton, home;
    private readonly SidebarIcon filterIcon = new() { Kind = "top", Width = 22, Height = 22 };
    private readonly SidebarIcon detailsIcon = new() { Kind = "right", Width = 22, Height = 22 };
    private readonly Button add;
    private readonly DataTemplate expandedTemplate, compactTemplate;
    private bool? compact;
    private string activePath = "";
    private Func<Favorite, MenuFlyout>? favoriteMenu;
    private static Style StyleFor(string key) => (Style)Application.Current.Resources[key];

    public SidebarView()
    {
        root.RowDefinitions.Add(new() { Height = GridLength.Auto }); root.RowDefinitions.Add(new() { Height = GridLength.Auto });
        root.RowDefinitions.Add(new() { Height = new(1, GridUnitType.Star) }); root.RowDefinitions.Add(new() { Height = GridLength.Auto });
        var brand = new Button { Content = new SidebarIcon { Kind = "logo", Width = 78, Height = 20 }, Style = StyleFor("CapSidebarBrandButton") };
        AutomationProperties.SetName(brand,"Cap7CE"); brand.Click += (_, _) => Navigate?.Invoke("");
        brandArea = new StackPanel(); brandArea.Children.Add(brand); root.Children.Add(brandArea);
        filterButton = PanelButton(filterIcon,"顶部筛选",()=>ToggleFilters?.Invoke());
        detailsButton = PanelButton(detailsIcon,"详细信息",()=>ToggleDetails?.Invoke());
        tools.Children.Add(filterButton); tools.Children.Add(detailsButton); Grid.SetRow(tools,1); root.Children.Add(tools);
        directories.RowDefinitions.Add(new() { Height = GridLength.Auto }); directories.RowDefinitions.Add(new() { Height = GridLength.Auto });
        directories.RowDefinitions.Add(new() { Height = new(1, GridUnitType.Star) });
        home = new ToggleButton { Style = StyleFor("CapSidebarHomeToggle") };
        home.Resources["CapSidebarCheckedForegroundBrush"] = Application.Current.Resources["CapSidebarSelectedForegroundBrush"];
        NavigationContent(home,"computer","此电脑",10,true); home.Click += (_,_)=>Navigate?.Invoke(""); directories.Children.Add(home);
        heading.Height = 32; heading.ColumnDefinitions.Add(new() { Width = new(1, GridUnitType.Star) }); heading.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        heading.Children.Add(header); header.Style = (Style)Application.Current.Resources["CapSidebarHeaderText"];
        add = new Button { Style = StyleFor("CapSidebarButton"), Width = 26, Height = 26, Padding = new(5), Content = new SidebarIcon { Kind = "add", Width = 16, Height = 16 } };
        ToolTipService.SetToolTip(add,"添加收藏目录"); AutomationProperties.SetName(add,"添加收藏目录"); add.Click += (_,_)=>AddFavorite?.Invoke();
        Grid.SetColumn(add,1); heading.Children.Add(add); Grid.SetRow(heading,1); directories.Children.Add(heading);
        Grid.SetRow(favorites,2); directories.Children.Add(favorites); Grid.SetRow(directories,2); root.Children.Add(directories);
        expandedTemplate = (DataTemplate)Application.Current.Resources["CapSidebarFavoriteTemplate"];
        compactTemplate = (DataTemplate)Application.Current.Resources["CapSidebarFavoriteCompactTemplate"];
        ScrollViewer.SetHorizontalScrollBarVisibility(favorites,ScrollBarVisibility.Disabled);
        favorites.ContainerContentChanging += PrepareFavorite;
        favorites.ItemClick += (_,e)=>{if(e.ClickedItem is Favorite item)Navigate?.Invoke(item.Path);};
        var settings = new Button { Style = StyleFor("CapSidebarButton"), Margin = new(5), Height = 36 };
        NavigationContent(settings,"settings","打开设置",8,false); settings.Click += (_,_)=>Settings?.Invoke();
        Grid.SetRow(settings,3); root.Children.Add(settings); Content = root;
        ApplyLayout(false,true,true,true); SetActivePath("");
    }

    private static ToggleButton PanelButton(SidebarIcon icon,string label,Action action)
    {
        var button = new ToggleButton { Content = icon, Style = StyleFor("CapSidebarToggle") };
        AutomationProperties.SetName(button,label); button.Click += (_,_)=>action(); return button;
    }

    private void NavigationContent(ContentControl button,string icon,string label,double gap,bool pill)
    {
        var text = new TextBlock { Text = label, TextWrapping = TextWrapping.NoWrap, TextTrimming = TextTrimming.CharacterEllipsis };
        var content = new Grid { ColumnSpacing = gap };
        content.ColumnDefinitions.Add(new() { Width = new(24) }); content.ColumnDefinitions.Add(new() { Width = new(1,GridUnitType.Star) });
        content.Children.Add(new SidebarIcon { Kind = icon, Width = icon=="settings"?22:24, Height = icon=="settings"?22:24 });
        Grid.SetColumn(text,1); text.VerticalAlignment = VerticalAlignment.Center; content.Children.Add(text); button.Content = content;
        AutomationProperties.SetName(button,label); ToolTipService.SetToolTip(button,label); navigation.Add((button,text,content,gap,pill));
    }

    public void ApplyLayout(bool isCompact,bool showBrand,bool filtersVisible,bool detailsVisible)
    {
        if(compact!=isCompact) {
            compact = isCompact; favorites.ItemTemplate = isCompact?compactTemplate:expandedTemplate;
            favorites.ItemContainerStyle = StyleFor(isCompact?"CapSidebarFavoriteCompactContainer":"CapSidebarFavoriteContainer");
        }
        root.Padding = new(0); brandArea.Visibility = showBrand?Visibility.Visible:Visibility.Collapsed;
        directories.Margin = isCompact?new(4,6,4,0):new(6,6,6,0);
        header.Visibility = isCompact?Visibility.Collapsed:Visibility.Visible;
        Grid.SetColumn(add,isCompact?0:1); Grid.SetColumnSpan(add,isCompact?2:1);
        tools.MaximumRowsOrColumns = isCompact?1:2; tools.ItemWidth = isCompact?32:39; tools.ItemHeight = isCompact?36:34;
        tools.Margin = isCompact?new(4,5,4,23):new(5,5,5,23); tools.HorizontalAlignment = isCompact?HorizontalAlignment.Center:HorizontalAlignment.Left;
        foreach(var button in new[]{filterButton,detailsButton})button.Width=button.Height=isCompact?32:34;
        foreach(var entry in navigation) {
            entry.Label.Visibility = isCompact?Visibility.Collapsed:Visibility.Visible;
            entry.Content.ColumnDefinitions[1].Width = isCompact?new(0):new(1,GridUnitType.Star); entry.Content.ColumnSpacing = isCompact?0:entry.Gap;
            entry.Button.Width = isCompact?32:double.NaN; entry.Button.Height = isCompact?32:36;
            entry.Button.Padding = isCompact?new(4):new(8,0,8,0); entry.Button.CornerRadius = new(isCompact?9:entry.Pill?18:8);
            entry.Button.HorizontalAlignment = isCompact?HorizontalAlignment.Center:HorizontalAlignment.Stretch;
            if(!entry.Pill)entry.Button.Margin = isCompact?new(4,5,4,5):new(5);
        }
        filterButton.IsChecked = filterIcon.IsActive = filtersVisible; detailsButton.IsChecked = detailsIcon.IsActive = detailsVisible;
        ToolTipService.SetToolTip(filterButton,filtersVisible?"收起顶部筛选":"显示顶部筛选");
        ToolTipService.SetToolTip(detailsButton,detailsVisible?"收起详细信息":"显示详细信息");
    }

    public void SetActivePath(string path)
    {
        activePath = path; home.IsChecked = path.Length==0;
        favorites.SelectedItem = favorites.Items.OfType<Favorite>().FirstOrDefault(item=>
            item.Path.TrimEnd('\\','/').Equals(path.TrimEnd('\\','/'),StringComparison.OrdinalIgnoreCase));
    }

    private void PrepareFavorite(ListViewBase sender, ContainerContentChangingEventArgs e)
    {
        if(e.InRecycleQueue || e.Item is not Favorite item)return;
        ToolTipService.SetToolTip(e.ItemContainer,item.Name+"\n"+item.Path); AutomationProperties.SetName(e.ItemContainer,item.Name);
        if(e.Phase==0) { e.RegisterUpdateCallback(1,PrepareFavorite); return; }
        if(e.ItemContainer.ContentTemplateRoot is not FrameworkElement content || content.FindName("FavoriteMore") is not Button more)return;
        AutomationProperties.SetName(more,"管理收藏："+item.Name);
        for(var parent=VisualTreeHelper.GetParent(more);parent is not null;parent=VisualTreeHelper.GetParent(parent))
            if(parent is ContentPresenter presenter) {
                more.SetBinding(ForegroundProperty,new Binding {Source=presenter,Path=new PropertyPath(nameof(ContentPresenter.Foreground))}); break;
            }
        if(more.Tag is true)return;
        more.Tag=true;
        more.Tapped+=(_,args)=>args.Handled=true;
        more.Click+=(_,_)=>{if(more.DataContext is Favorite current)favoriteMenu?.Invoke(current).ShowAt(more);};
    }

    public void Bind(FavoriteService service, FileCommands commands, Func<XamlRoot> xaml)
    {
        favorites.ItemsSource = service.Items;
        service.Changed += () => DispatcherQueue.TryEnqueue(()=>{favorites.ItemsSource=service.Items;SetActivePath(activePath);});
        favoriteMenu = item => {
            var menu=ThemeService.Menu();
            menu.Items.Add(Ui.MenuItem("打开",()=>Navigate?.Invoke(item.Path)));
            menu.Items.Add(Ui.MenuItem("在资源管理器中打开",()=>commands.Run(()=>{FileCommands.OpenDirectoryInExplorer(item.Path);return Task.CompletedTask;})));
            menu.Items.Add(Ui.MenuItem("复制路径",()=>commands.Run(()=>{FileCommands.CopyPath(item.Path);return Task.CompletedTask;})));
            menu.Items.Add(new MenuFlyoutSeparator());
            menu.Items.Add(Ui.MenuItem("修改显示名称",()=>commands.Run(async()=>{
                var input=new TextBox {Text=item.Name}; var dialog=new ContentDialog {XamlRoot=xaml(),Title="收藏显示名称",Content=input,PrimaryButtonText="保存",CloseButtonText="取消"};
                if(await dialog.ShowAsync()==ContentDialogResult.Primary) await service.ExecuteAsync("rename",id:item.Id,name:input.Text);
            })));
            var index=service.Items.ToList().FindIndex(entry=>entry.Id==item.Id);
            var up=Ui.MenuItem("上移",()=>commands.Run(()=>service.ExecuteAsync("move",id:item.Id,direction:"up"))); up.IsEnabled=index>0;
            var down=Ui.MenuItem("下移",()=>commands.Run(()=>service.ExecuteAsync("move",id:item.Id,direction:"down"))); down.IsEnabled=index>=0 && index<service.Items.Count-1;
            menu.Items.Add(up); menu.Items.Add(down);
            menu.Items.Add(Ui.MenuItem("移除收藏",()=>commands.Run(()=>service.ExecuteAsync("remove",id:item.Id))));
            return menu;
        };
        favorites.RightTapped += (_, e) => {
            if((e.OriginalSource as FrameworkElement)?.DataContext is not Favorite item) return;
            e.Handled=true; var menu=favoriteMenu(item);
            menu.ShowAt(favorites,new Microsoft.UI.Xaml.Controls.Primitives.FlyoutShowOptions { Position=e.GetPosition(favorites) });
        };
    }
}
