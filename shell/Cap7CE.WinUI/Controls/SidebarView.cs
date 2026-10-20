using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Markup;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Themes;

namespace Cap7CE.WinUI.Controls;
internal sealed class SidebarView : UserControl
{
    private readonly ListView favorites = new() { SelectionMode = ListViewSelectionMode.None, IsItemClickEnabled = true, HorizontalContentAlignment = HorizontalAlignment.Stretch };
    public event Action<string>? Navigate;
    public event Action? AddFavorite, Settings, ToggleFilters, ToggleDetails;
    private readonly Grid root = new();
    private readonly StackPanel brandArea;
    private readonly VariableSizedWrapGrid tools = new() { Orientation = Orientation.Horizontal, ItemWidth = 36, ItemHeight = 36, MaximumRowsOrColumns = 2 };
    private readonly TextBlock header = Ui.Text("已添加目录", true);
    private readonly List<(Button Button, TextBlock Label)> navigation = [];
    private readonly Button filterButton, detailsButton;
    private readonly DataTemplate expandedTemplate, compactTemplate;
    private bool? compact;
    public SidebarView()
    {
        root.RowDefinitions.Add(new() { Height = GridLength.Auto }); root.RowDefinitions.Add(new() { Height = GridLength.Auto });
        root.RowDefinitions.Add(new() { Height = new(1, GridUnitType.Star) }); root.RowDefinitions.Add(new() { Height = GridLength.Auto });
        var brand = new Button { Content = Ui.Icon("logo-cap7ce", 80), Background = null, BorderThickness = new(0) };
        brand.Click += (_, _) => Navigate?.Invoke("");
        var accent = new Border { Height = 3, CornerRadius = new(2), Margin = new(8,0,8,8), Background = (Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["CapAccentGradient"] };
        brandArea = Ui.Column(brand, accent); brandArea.Margin = new(0,8,0,8); root.Children.Add(brandArea);
        filterButton = Ui.Tool("\uE71C", "顶部筛选", () => ToggleFilters?.Invoke());
        detailsButton = Ui.Tool("\uE946", "详细信息", () => ToggleDetails?.Invoke());
        tools.Children.Add(filterButton); tools.Children.Add(detailsButton); Grid.SetRow(tools, 1); root.Children.Add(tools);
        var directories = new Grid { RowSpacing = 4 };
        directories.RowDefinitions.Add(new() { Height = GridLength.Auto }); directories.RowDefinitions.Add(new() { Height = GridLength.Auto });
        directories.RowDefinitions.Add(new() { Height = new(1, GridUnitType.Star) });
        directories.Children.Add(Navigation("\uE7F4", "此电脑", () => Navigate?.Invoke("")));
        var heading = new Grid(); heading.ColumnDefinitions.Add(new() { Width = new(1, GridUnitType.Star) }); heading.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        heading.Children.Add(header); header.VerticalAlignment = VerticalAlignment.Center;
        var add = Ui.Tool("\uE710", "添加收藏目录", () => AddFavorite?.Invoke()); Grid.SetColumn(add,1); heading.Children.Add(add);
        Grid.SetRow(heading,1); directories.Children.Add(heading); Grid.SetRow(favorites,2); directories.Children.Add(favorites);
        Grid.SetRow(directories,2); root.Children.Add(directories);
        expandedTemplate = FavoriteTemplate(false); compactTemplate = FavoriteTemplate(true);
        var itemStyle = new Style(typeof(ListViewItem));
        itemStyle.Setters.Add(new Setter(MinWidthProperty, 0d)); itemStyle.Setters.Add(new Setter(MinHeightProperty, 32d));
        itemStyle.Setters.Add(new Setter(PaddingProperty, new Thickness(0))); itemStyle.Setters.Add(new Setter(HorizontalContentAlignmentProperty, HorizontalAlignment.Stretch));
        favorites.ItemContainerStyle = itemStyle;
        ScrollViewer.SetHorizontalScrollBarVisibility(favorites, ScrollBarVisibility.Disabled);
        favorites.ContainerContentChanging += (_, e) => {
            if (e.Item is not Favorite item) return;
            ToolTipService.SetToolTip(e.ItemContainer, item.Name + "\n" + item.Path);
            AutomationProperties.SetName(e.ItemContainer, item.Name);
        };
        favorites.ItemClick += (_, e) => { if(e.ClickedItem is Favorite item) Navigate?.Invoke(item.Path); };
        var settings = Navigation("\uE713", "设置", () => Settings?.Invoke()); Grid.SetRow(settings,3); root.Children.Add(settings); Content=root;
        ApplyLayout(false,true,true,true);
    }

    private Button Navigation(string glyph, string label, Action action)
    {
        var text = Ui.Text(label); text.TextWrapping = TextWrapping.NoWrap; text.TextTrimming = TextTrimming.CharacterEllipsis;
        var button = Ui.Tool(glyph, label, action);
        button.Content = Ui.Row((UIElement)button.Content, text); button.HorizontalContentAlignment = HorizontalAlignment.Left;
        navigation.Add((button,text)); return button;
    }

    private static DataTemplate FavoriteTemplate(bool compact) => (DataTemplate)XamlReader.Load(
        "<DataTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation'><StackPanel Orientation='Horizontal' Spacing='8' Padding='4' Height='32'>" +
        "<FontIcon Glyph='&#xE8B7;' FontSize='20' Width='24'/>" +
        (compact ? "" : "<TextBlock Text='{Binding Name}' VerticalAlignment='Center' TextTrimming='CharacterEllipsis'/>") + "</StackPanel></DataTemplate>");

    public void ApplyLayout(bool isCompact, bool showBrand, bool filtersVisible, bool detailsVisible)
    {
        if (compact != isCompact) { compact = isCompact; favorites.ItemTemplate = isCompact ? compactTemplate : expandedTemplate; }
        root.Padding = new(4,0,4,4); brandArea.Visibility = showBrand ? Visibility.Visible : Visibility.Collapsed;
        header.Visibility = isCompact ? Visibility.Collapsed : Visibility.Visible;
        tools.MaximumRowsOrColumns = isCompact ? 1 : 2;
        tools.ItemWidth = isCompact ? 32 : 36; tools.HorizontalAlignment = isCompact ? HorizontalAlignment.Center : HorizontalAlignment.Left;
        foreach (var entry in navigation) {
            entry.Label.Visibility = isCompact ? Visibility.Collapsed : Visibility.Visible;
            entry.Button.Width = isCompact ? 32 : double.NaN;
            entry.Button.HorizontalAlignment = isCompact ? HorizontalAlignment.Center : HorizontalAlignment.Stretch;
        }
        AutomationProperties.SetHelpText(filterButton, filtersVisible ? "收起顶部筛选" : "显示顶部筛选");
        AutomationProperties.SetHelpText(detailsButton, detailsVisible ? "收起详细信息" : "显示详细信息");
        ToolTipService.SetToolTip(filterButton, filtersVisible ? "收起顶部筛选" : "显示顶部筛选");
        ToolTipService.SetToolTip(detailsButton, detailsVisible ? "收起详细信息" : "显示详细信息");
    }
    public void Bind(FavoriteService service, FileCommands commands, Func<XamlRoot> xaml)
    {
        favorites.ItemsSource = service.Items;
        service.Changed += () => DispatcherQueue.TryEnqueue(()=>favorites.ItemsSource=service.Items);
        favorites.RightTapped += (_, e) => {
            if((e.OriginalSource as FrameworkElement)?.DataContext is not Favorite item) return;
            e.Handled=true; var menu=ThemeService.Menu();
            menu.Items.Add(Ui.MenuItem("打开",()=>Navigate?.Invoke(item.Path)));
            menu.Items.Add(Ui.MenuItem("修改显示名称",()=>commands.Run(async()=>{
                var input=new TextBox {Text=item.Name}; var dialog=new ContentDialog {XamlRoot=xaml(),Title="收藏显示名称",Content=input,PrimaryButtonText="保存",CloseButtonText="取消"};
                if(await dialog.ShowAsync()==ContentDialogResult.Primary) await service.ExecuteAsync("rename",id:item.Id,name:input.Text);
            })));
            menu.Items.Add(Ui.MenuItem("上移",()=>commands.Run(()=>service.ExecuteAsync("move",id:item.Id,direction:"up"))));
            menu.Items.Add(Ui.MenuItem("下移",()=>commands.Run(()=>service.ExecuteAsync("move",id:item.Id,direction:"down"))));
            menu.Items.Add(Ui.MenuItem("移除收藏",()=>commands.Run(()=>service.ExecuteAsync("remove",id:item.Id))));
            menu.ShowAt(favorites,new Microsoft.UI.Xaml.Controls.Primitives.FlyoutShowOptions { Position=e.GetPosition(favorites) });
        };
    }
}
