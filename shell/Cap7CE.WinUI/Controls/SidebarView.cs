using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Themes;

namespace Cap7CE.WinUI.Controls;
internal sealed class SidebarView : UserControl
{
    private readonly ListView favorites = new() { SelectionMode = ListViewSelectionMode.None, IsItemClickEnabled = true, DisplayMemberPath = "Name" };
    public event Action<string>? Navigate;
    public event Action? AddFavorite, Settings, ToggleFilters, ToggleDetails;
    private readonly StackPanel column;
    public SidebarView()
    {
        var root = new Grid { Padding = new(12,14,8,8) };
        root.RowDefinitions.Add(new() { Height = new(1, GridUnitType.Star) }); root.RowDefinitions.Add(new() { Height = GridLength.Auto });
        var brand = new Button { Content = Ui.Icon("logo-cap7ce", 80), Background = null, BorderThickness = new(0) };
        brand.Click += (_, _) => Navigate?.Invoke("");
        var accent = new Border { Height = 3, CornerRadius = new(2), Margin = new(8,0,8,8), Background = (Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["CapAccentGradient"] };
        column = Ui.Column(brand, accent, Ui.Row(Ui.Tool("\uE71C","顶部筛选",()=>ToggleFilters?.Invoke()),Ui.Tool("\uE946","详细信息",()=>ToggleDetails?.Invoke())),
            Ui.Button("此电脑",()=>Navigate?.Invoke("")), Ui.Text("已添加目录",true), favorites,
            Ui.Tool("\uE710","添加收藏目录",()=>AddFavorite?.Invoke()));
        favorites.ItemClick += (_, e) => { if(e.ClickedItem is Favorite item) Navigate?.Invoke(item.Path); };
        root.Children.Add(new ScrollViewer { Content = column, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled });
        var settings=Ui.Button("⚙  设置",()=>Settings?.Invoke()); Grid.SetRow(settings,1); root.Children.Add(settings); Content=root;
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
