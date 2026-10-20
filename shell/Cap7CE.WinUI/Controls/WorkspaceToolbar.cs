using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Cap7CE.WinUI.Controllers;
using Cap7CE.WinUI.Themes;
using Windows.System;

namespace Cap7CE.WinUI.Controls;
internal sealed class WorkspaceToolbar : UserControl
{
    private readonly TextBox address = new() { PlaceholderText = "此电脑 / 目录路径", MinWidth = 100 };
    private readonly AutoSuggestBox search = new() { PlaceholderText = "搜索名称、路径、关键词", QueryIcon = new SymbolIcon(Symbol.Find) };
    private readonly Button back, forward, up, view;
    private BrowseSession? session;
    private string boundPath="",boundQuery="";
    public event Action? OpenFolder, ViewChanged;
    public event Action<double>? SizeChangedByUser;
    public event Action<double>? SizeCommitted;
    public WorkspaceToolbar()
    {
        var root = new Grid { ColumnSpacing = 6, Padding = new(8), Background = null };
        root.ColumnDefinitions.Add(new() { Width = GridLength.Auto }); root.ColumnDefinitions.Add(new() { Width = new(1, GridUnitType.Star) });
        root.ColumnDefinitions.Add(new() { Width = new(260) }); root.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        back = Ui.Tool("\uE72B", "返回 · Alt+←", () => Run(() => session!.BackAsync()));
        forward = Ui.Tool("\uE72A", "前进 · Alt+→", () => Run(() => session!.ForwardAsync()));
        up = Ui.Tool("\uE74A", "上一级", () => Run(() => session!.UpAsync()));
        root.Children.Add(Ui.Row(back, forward, up, Ui.Tool("\uE72C", "刷新 · F5", () => Reload()), Ui.Tool("\uE8B7", "打开目录 · Ctrl+O", () => OpenFolder?.Invoke())));
        Grid.SetColumn(address,1); root.Children.Add(address); Grid.SetColumn(search,2); root.Children.Add(search);
        address.KeyDown += (_, e) => { if (e.Key == VirtualKey.Enter && session is not null) { e.Handled = true; session.Query = ""; Run(() => session.NavigateAsync(address.Text)); } };
        search.QuerySubmitted += (_, e) => { if (session is not null) { session.Query = e.QueryText; Reload(); } };
        var random = Ui.Tool("\uE8B1", "随机浏览 / 换一批", () => { if (session is null) return; session.Random = true; session.Seed = (uint)System.Random.Shared.Next(); Reload(); });
        view = Ui.Tool("\uE8A9", "列表 / 网格", () => ViewChanged?.Invoke());
        var options = Ui.Tool("\uE713", "浏览选项", Options);
        var size = new Slider { Minimum = 96, Maximum = 280, Value = 160, Width = 78 };
        size.ValueChanged += (_, e) => SizeChangedByUser?.Invoke(e.NewValue);
        size.PointerCaptureLost += (_, _) => SizeCommitted?.Invoke(size.Value);
        size.LostFocus += (_, _) => SizeCommitted?.Invoke(size.Value);
        var tools = Ui.Row(random, size, view, options); Grid.SetColumn(tools,3); root.Children.Add(tools);
        Content = root;
    }
    public void Bind(BrowseSession value)
    {
        if(!ReferenceEquals(session,value)||boundPath!=value.PathValue)address.Text=value.PathValue;
        if(!ReferenceEquals(session,value)||boundQuery!=value.Query)search.Text=value.Query;
        boundPath=value.PathValue;boundQuery=value.Query;session=value;
        back.IsEnabled=value.CanBack;forward.IsEnabled=value.CanForward;up.IsEnabled=value.PathValue.Length>0;
    }
    public void FocusSearch() => search.Focus(FocusState.Programmatic);
    public void FocusPath() { address.Focus(FocusState.Programmatic); address.SelectAll(); }
    private void Reload() { if (session is not null) Run(() => session.NavigateAsync(session.PathValue, false)); }
    private static async void Run(Func<Task> action) { await action(); }
    private void Options()
    {
        if (session is null) return; var menu = ThemeService.Menu();
        var labels = new[] { "名称 ↑", "名称 ↓", "修改时间 ↑", "修改时间 ↓" }; var sorts = new[] { "name-ascending", "name-descending", "modified-ascending", "modified-descending" };
        for (var i = 0; i < labels.Length; i++) { var index = i; menu.Items.Add(Ui.MenuItem((session.Sort == sorts[i] ? "✓ " : "") + labels[i], () => { session.Sort = sorts[index]; session.Random = false; Reload(); })); }
        menu.Items.Add(new MenuFlyoutSeparator());
        menu.Items.Add(Ui.MenuItem((session.ShowHidden ? "✓ " : "") + "显示隐藏项", () => { session.ShowHidden = !session.ShowHidden; Reload(); }));
        menu.Items.Add(Ui.MenuItem((session.Recursive ? "✓ " : "") + "包含子文件夹", () => { session.Recursive = !session.Recursive; Reload(); }));
        menu.Items.Add(Ui.MenuItem((session.Random ? "✓ " : "") + "随机浏览", () => { session.Random = !session.Random; Reload(); }));
        menu.ShowAt(this);
    }
}
