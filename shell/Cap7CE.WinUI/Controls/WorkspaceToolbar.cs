using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Cap7CE.WinUI.Controllers;
using Cap7CE.WinUI.Themes;
using Windows.System;

namespace Cap7CE.WinUI.Controls;
internal sealed class WorkspaceToolbar : UserControl
{
    private readonly TextBox address = new() { PlaceholderText = "此电脑 / 目录路径", MinWidth = 0 };
    private readonly AutoSuggestBox search = new() { PlaceholderText = "搜索名称、路径、关键词", QueryIcon = new SymbolIcon(Symbol.Find) };
    private readonly Button back, forward, up, view;
    private readonly Grid root = new() { ColumnSpacing = 6, Padding = new(8), Background = null };
    private readonly StackPanel navigation, tools;
    private readonly Button random;
    private readonly Slider size;
    private bool narrow, editingSearch;
    private BrowseSession? session;
    private string boundPath="",boundQuery="";
    public event Action? OpenFolder, ViewChanged, ToggleFilters, ToggleDetails, OpenSettings;
    public event Action<double>? SizeChangedByUser;
    public event Action<double>? SizeCommitted;
    public WorkspaceToolbar()
    {
        root.ColumnDefinitions.Add(new() { Width = GridLength.Auto }); root.ColumnDefinitions.Add(new() { Width = new(1, GridUnitType.Star) });
        root.ColumnDefinitions.Add(new() { Width = new(1, GridUnitType.Star) }); root.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        back = Ui.Tool("\uE72B", "返回 · Alt+←", () => Run(() => session!.BackAsync()));
        forward = Ui.Tool("\uE72A", "前进 · Alt+→", () => Run(() => session!.ForwardAsync()));
        up = Ui.Tool("\uE74A", "上一级", () => Run(() => session!.UpAsync()));
        navigation = Ui.Row(back, forward, up, Ui.Tool("\uE72C", "刷新 · F5", () => Reload()), Ui.Tool("\uE8B7", "打开目录 · Ctrl+O", () => OpenFolder?.Invoke()));
        root.Children.Add(navigation);
        Grid.SetColumn(address,1); root.Children.Add(address); Grid.SetColumn(search,2); root.Children.Add(search);
        address.KeyDown += (_, e) => { if (e.Key == VirtualKey.Enter && session is not null) { e.Handled = true; session.Query = ""; Run(() => session.NavigateAsync(address.Text)); } };
        search.QuerySubmitted += (_, e) => { if (session is not null) { session.Query = e.QueryText; Reload(); } };
        random = Ui.Tool("\uE8B1", "随机浏览 / 换一批", () => { if (session is null) return; session.Random = true; session.Seed = (uint)System.Random.Shared.Next(); Reload(); });
        view = Ui.Tool("\uE8A9", "列表 / 网格", () => ViewChanged?.Invoke());
        var options = Ui.Tool("\uE713", "浏览选项", Options);
        size = new Slider { Minimum = 96, Maximum = 280, Value = 160, Width = 78 };
        size.ValueChanged += (_, e) => SizeChangedByUser?.Invoke(e.NewValue);
        size.PointerCaptureLost += (_, _) => SizeCommitted?.Invoke(size.Value);
        size.LostFocus += (_, _) => SizeCommitted?.Invoke(size.Value);
        tools = Ui.Row(random, size, view, options); Grid.SetColumn(tools,3); root.Children.Add(tools);
        root.SizeChanged += (_, _) => { narrow = root.ActualWidth <= 560; Reflow(); };
        search.LostFocus += (_, _) => { if (narrow) { editingSearch = false; Reflow(); } };
        Content = root;
    }
    public void Bind(BrowseSession value)
    {
        if(!ReferenceEquals(session,value)||boundPath!=value.PathValue)address.Text=value.PathValue;
        if(!ReferenceEquals(session,value)||boundQuery!=value.Query)search.Text=value.Query;
        boundPath=value.PathValue;boundQuery=value.Query;session=value;
        back.IsEnabled=value.CanBack;forward.IsEnabled=value.CanForward;up.IsEnabled=value.PathValue.Length>0;
    }
    private void Reflow()
    {
        navigation.Visibility = narrow ? Visibility.Collapsed : Visibility.Visible;
        random.Visibility = size.Visibility = view.Visibility = narrow ? Visibility.Collapsed : Visibility.Visible;
        tools.Spacing = narrow ? 0 : 6;
        root.ColumnDefinitions[2].Width = narrow ? new(0) : new(1, GridUnitType.Star);
        Grid.SetColumn(search, narrow ? 1 : 2);
        address.Visibility = narrow && editingSearch ? Visibility.Collapsed : Visibility.Visible;
        search.Visibility = !narrow || editingSearch ? Visibility.Visible : Visibility.Collapsed;
    }
    public void FocusSearch() { editingSearch = true; Reflow(); search.Focus(FocusState.Programmatic); }
    public void FocusPath() { editingSearch = false; Reflow(); address.Focus(FocusState.Programmatic); address.SelectAll(); }
    private void Reload() { if (session is not null) Run(() => session.NavigateAsync(session.PathValue, false)); }
    private static async void Run(Func<Task> action) { await action(); }
    private void Options()
    {
        var menu = ThemeService.Menu();
        menu.Items.Add(Ui.MenuItem("顶部筛选：显示 / 收起", () => ToggleFilters?.Invoke()));
        menu.Items.Add(Ui.MenuItem("详细信息：显示 / 收起", () => ToggleDetails?.Invoke()));
        menu.Items.Add(Ui.MenuItem("打开设置", () => OpenSettings?.Invoke()));
        menu.Items.Add(Ui.MenuItem("搜索 · Ctrl+F", FocusSearch));
        menu.Items.Add(Ui.MenuItem("输入路径 · Ctrl+L", FocusPath));
        menu.Items.Add(Ui.MenuItem("打开目录 · Ctrl+O", () => OpenFolder?.Invoke()));
        menu.Items.Add(Ui.MenuItem("刷新 · F5", Reload));
        menu.Items.Add(Ui.MenuItem("列表 / 网格", () => ViewChanged?.Invoke()));
        if (session is null) { menu.ShowAt(this); return; }
        menu.Items.Add(Ui.MenuItem("返回", () => Run(() => session.BackAsync())));
        menu.Items.Add(Ui.MenuItem("前进", () => Run(() => session.ForwardAsync())));
        menu.Items.Add(Ui.MenuItem("上一级", () => Run(() => session.UpAsync())));
        menu.Items.Add(new MenuFlyoutSeparator());
        var labels = new[] { "名称 ↑", "名称 ↓", "修改时间 ↑", "修改时间 ↓" }; var sorts = new[] { "name-ascending", "name-descending", "modified-ascending", "modified-descending" };
        for (var i = 0; i < labels.Length; i++) { var index = i; menu.Items.Add(Ui.MenuItem((session.Sort == sorts[i] ? "✓ " : "") + labels[i], () => { session.Sort = sorts[index]; session.Random = false; Reload(); })); }
        menu.Items.Add(new MenuFlyoutSeparator());
        menu.Items.Add(Ui.MenuItem((session.ShowHidden ? "✓ " : "") + "显示隐藏项", () => { session.ShowHidden = !session.ShowHidden; Reload(); }));
        menu.Items.Add(Ui.MenuItem((session.Recursive ? "✓ " : "") + "包含子文件夹", () => { session.Recursive = !session.Recursive; Reload(); }));
        menu.Items.Add(Ui.MenuItem((session.Random ? "✓ " : "") + "随机浏览", () => { session.Random = !session.Random; Reload(); }));
        menu.ShowAt(this);
    }
}
