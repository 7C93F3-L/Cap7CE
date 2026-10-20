using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Markup;
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
    private FileCommands? commands;
    private AssetCollection? items;
    private bool listMode;
    private bool horizontal;
    private readonly ResultsGridLayout gridLayout;
    private ListViewBase ActiveView => listMode && !horizontal ? list : grid;
    public event Action<IReadOnlyList<AssetItem>>? SelectionChanged;
    public IReadOnlyList<AssetItem> Selection => ActiveView.SelectedItems.OfType<AssetItem>().ToArray();
    public ResultsView()
    {
        grid.ItemsPanel = (ItemsPanelTemplate)XamlReader.Load("<ItemsPanelTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation'><ItemsWrapGrid Orientation='Horizontal' CacheLength='1'/></ItemsPanelTemplate>");
        grid.ItemTemplate = (DataTemplate)Application.Current.Resources["CapAssetTileTemplate"];
        gridLayout = new(grid);
        list.ItemTemplate = (DataTemplate)XamlReader.Load("<DataTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation'><StackPanel Orientation='Horizontal' Spacing='18' Padding='6'><FontIcon Glyph='&#xE8A5;' FontSize='16'/><TextBlock Text='{Binding Name}' Width='300' TextTrimming='CharacterEllipsis'/><TextBlock Text='{Binding SizeLabel}' Width='90'/><TextBlock Text='{Binding ModifiedLabel}' Width='150'/><TextBlock Text='{Binding FullPath}' Opacity='0.55' TextTrimming='CharacterEllipsis'/></StackPanel></DataTemplate>");
        foreach (var view in new ListViewBase[] { grid, list })
        {
            view.SelectionChanged += (_, _) => SelectionChanged?.Invoke(Selection);
            view.DoubleTapped += OnItemDoubleTapped; view.RightTapped += Context;
            view.DragItemsStarting += OnItemsDragStarting; root.Children.Add(view);
        }
        list.Visibility = Visibility.Collapsed; empty.HorizontalAlignment = HorizontalAlignment.Center; empty.VerticalAlignment = VerticalAlignment.Center;
        empty.IsHitTestVisible = false; root.Children.Add(empty); Content = root;
    }
    public void Configure(FileCommands value) => commands = value;
    public void Bind(AssetCollection value)
    {
        if (!ReferenceEquals(items, value)) { items = value; grid.ItemsSource = value; list.ItemsSource = value; SelectionChanged?.Invoke([]); }
        empty.Visibility = value.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        empty.Text = "没有匹配项，或目录尚未就绪";
    }
    public void View(bool isList) { var previous=ActiveView;listMode=isList;ApplyView(previous);gridLayout.SetHorizontal(horizontal); }
    public void SetHorizontal(bool value)
    {
        if(horizontal==value)return;
        var previous=ActiveView;horizontal=value;ApplyView(previous);gridLayout.SetHorizontal(value);
    }
    private void ApplyView(ListViewBase previous)
    {
        var current=ActiveView;
        if(!ReferenceEquals(previous,current))
        {
            var selected=previous.SelectedItems.OfType<AssetItem>().ToArray();current.SelectedItems.Clear();
            foreach(var item in selected)if(items?.Contains(item)==true)current.SelectedItems.Add(item);
        }
        grid.Visibility=ReferenceEquals(current,grid)?Visibility.Visible:Visibility.Collapsed;
        list.Visibility=ReferenceEquals(current,list)?Visibility.Visible:Visibility.Collapsed;
        if(!ReferenceEquals(previous,current))SelectionChanged?.Invoke(Selection);
    }
    public void SelectAll() => ActiveView.SelectAll();
    public void Suspend(bool value) { foreach (var tile in Tiles(root)) tile.Suspend(value); }
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
        var selected = e.Items.OfType<AssetItem>().ToArray();
        if (selected.Length is < 1 or > 200 || selected.Any(i => i.FullPath.Length == 0)) { e.Cancel = true; return; }
        e.Data.RequestedOperation = DataPackageOperation.Copy;
        e.Data.SetDataProvider(StandardDataFormats.StorageItems, async request => {
            var deferral = request.GetDeferral();
            try { request.SetData(await FileCommands.StorageItemsAsync(selected)); }
            catch { }
            finally { deferral.Complete(); }
        });
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
