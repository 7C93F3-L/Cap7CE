using Microsoft.UI.Xaml;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Localization;
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
    private readonly TextBlock empty = L.Text("main.connecting", true);
    private readonly Grid root = new();
    private readonly ResultsGallery gallery=new(){Visibility=Visibility.Collapsed};
    private readonly StackPanel emptyPanel=new(){Spacing=8,HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center,MaxWidth=380,Margin=new(16)};
    private readonly TextBlock emptyHint=Ui.Text("",true);
    private readonly Button retry=L.Button("main.retry",()=>{}),clearFilters=L.Button("main.clearFilters",()=>{});
    private readonly StackPanel emptyActions=new(){Orientation=Orientation.Horizontal,Spacing=6,HorizontalAlignment=HorizontalAlignment.Center};
    private bool square=true,home,suspended,binding;
    private bool IsGallery=>!square&&!listMode&&!horizontal&&!home;
    public event Action? Retry,ClearFilters;
    public Func<KeyRoutedEventArgs,bool>? HandleShortcut {get;set;}
    private FileCommands? commands;
    private AssetCollection? items;
    private bool listMode;
    private bool horizontal;
    private bool keyboardSelect;
    private readonly ResultsGridLayout gridLayout;
    private ListViewBase ActiveView => listMode && !horizontal ? list : grid;
    public event Action<IReadOnlyList<AssetItem>>? SelectionChanged;
    public IReadOnlyList<AssetItem> Selection => IsGallery?gallery.Selection:ActiveView.SelectedItems.OfType<AssetItem>().ToArray();
    public ResultsView()
    {
        PreviewKeyDown+=(_,e)=>{
            keyboardSelect=!IsGallery&&ReferenceEquals(ActiveView,grid)
                &&e.Key is Windows.System.VirtualKey.Left or Windows.System.VirtualKey.Right or Windows.System.VirtualKey.Up or Windows.System.VirtualKey.Down or Windows.System.VirtualKey.Home or Windows.System.VirtualKey.End
                &&!new[]{Windows.System.VirtualKey.Control,Windows.System.VirtualKey.Menu,Windows.System.VirtualKey.Shift}.Any(key=>Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(key).HasFlag(Windows.UI.Core.CoreVirtualKeyStates.Down));
            HandleShortcut?.Invoke(e);
        };
        grid.Resources["GridViewHeaderItemDividerStroke"]=new Microsoft.UI.Xaml.Media.SolidColorBrush(Microsoft.UI.Colors.Transparent);
        grid.ItemsPanel = (ItemsPanelTemplate)XamlReader.Load("<ItemsPanelTemplate xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation'><ItemsWrapGrid Orientation='Horizontal' CacheLength='1'/></ItemsPanelTemplate>");
        grid.ItemTemplate = (DataTemplate)Application.Current.Resources["CapAssetTileTemplate"];
        grid.ItemContainerStyle=(Style)Application.Current.Resources["CapResultItem"];grid.Padding=new(6);
        grid.GroupStyle.Add(new GroupStyle{HeaderTemplate=(DataTemplate)Application.Current.Resources["CapHomeGroupHeaderTemplate"]});
        gridLayout = new(grid);
        grid.GotFocus+=(_,_)=>{
            if(!keyboardSelect)return;
            var target=FocusManager.GetFocusedElement(grid.XamlRoot) as DependencyObject;
            while(target is not null&&target is not GridViewItem)target=Microsoft.UI.Xaml.Media.VisualTreeHelper.GetParent(target);
            if(target is GridViewItem {FocusState:FocusState.Keyboard} container&&grid.ItemFromContainer(container) is AssetItem item
                &&(grid.SelectedItems.Count!=1||!grid.SelectedItems.Contains(item))) {
                grid.SelectedItems.Clear();grid.SelectedItem=item;
            }
        };
        list.ItemTemplate = (DataTemplate)Application.Current.Resources["CapAssetListTemplate"];
        foreach (var view in new ListViewBase[] { grid, list })
        {
            IdleScrollBars.Attach(view);
            view.SelectionChanged += (_, _) => {if(!binding)SelectionChanged?.Invoke(Selection);};
            view.DoubleTapped += OnItemDoubleTapped; view.RightTapped += Context;
            view.DragItemsStarting += OnItemsDragStarting;
            view.DragItemsStarting+=(_,e)=>{if(!e.Cancel)ResultDrag.SetActive(view,true);};
            view.DragItemsCompleted+=(_,_)=>ResultDrag.SetActive(view,false);
            view.Unloaded+=(_,_)=>ResultDrag.SetActive(view,false);root.Children.Add(view);
        }
        list.Visibility=Visibility.Collapsed;root.Children.Add(gallery);gallery.SelectionChanged+=()=>{if(IsGallery&&!binding)SelectionChanged?.Invoke(Selection);};
        empty.HorizontalTextAlignment=TextAlignment.Center;emptyHint.HorizontalTextAlignment=TextAlignment.Center;
        retry.Click+=(_,_)=>Retry?.Invoke();clearFilters.Click+=(_,_)=>ClearFilters?.Invoke();
        emptyActions.Children.Add(retry);emptyActions.Children.Add(clearFilters);
        emptyPanel.Children.Add(empty);emptyPanel.Children.Add(emptyHint);emptyPanel.Children.Add(emptyActions);root.Children.Add(emptyPanel);
        root.Background=new Microsoft.UI.Xaml.Media.SolidColorBrush(Microsoft.UI.Colors.Transparent);
        root.AddHandler(UIElement.TappedEvent,new TappedEventHandler((_,e)=>{if(IsBlank(e.OriginalSource as DependencyObject))ClearSelection();}),true);Content=root;
    }
    public void Configure(FileCommands value){commands=value;gallery.Configure(value);}
    public void Bind(AssetCollection value,bool isHome=false,bool busy=false,UiMessage? error=null,bool filtered=false,bool preserveSelection=false)
    {
        if(!ReferenceEquals(items,value)||home!=isHome) {
            var retained=preserveSelection?CatalogRefreshRules.RetainSelection(Selection,value,item=>item.FullPath+"|"+item.Entry.FileReference):[];
            binding=true;
            try {
                var wasGallery=IsGallery;home=isHome;items=value;SetGridSource();
                list.ItemsSource=value;gallery.Bind(value,preserveSelection);ApplyView(ActiveView,wasGallery);
                if(IsGallery)gallery.ReplaceSelection(retained);else foreach(var item in retained)ActiveView.SelectedItems.Add(item);
            } finally {binding=false;}
            SelectionChanged?.Invoke(Selection);
        }
        emptyPanel.Visibility=value.Count==0?Visibility.Visible:Visibility.Collapsed;
        L.Bind(empty,TextBlock.TextProperty,busy?"main.loading":error is not null?"main.locationUnavailable":"main.noMatches");
        if(error is not null)L.Message(emptyHint,TextBlock.TextProperty,error);else L.Bind(emptyHint,TextBlock.TextProperty,filtered?"main.adjustFilters":"main.emptyFolder");
        retry.Visibility=!busy?Visibility.Visible:Visibility.Collapsed;clearFilters.Visibility=!busy&&filtered?Visibility.Visible:Visibility.Collapsed;
    }
    public void Preferences(ShellPreferences value){var previous=ActiveView;var old=IsGallery;listMode=value.View=="list";square=value.SquareTiles;gallery.Size(value.TileSize);ApplyView(previous,old);gridLayout.Refresh();}
    public void PreviewSize(double value){gallery.Size(value);gridLayout.Refresh();}
    public void SetHorizontal(bool value)
    {
        if(horizontal==value)return;
        var previous=ActiveView;var old=IsGallery;var selected=Selection;horizontal=value;
        if(home){SetGridSource();foreach(var item in selected)if(items?.Contains(item)==true)grid.SelectedItems.Add(item);}
        ApplyView(previous,old);gridLayout.SetHorizontal(value);
    }
    private void SetGridSource()
    {grid.ItemsSource=home&&!horizontal&&items is {} value?new CollectionViewSource{IsSourceGrouped=true,Source=new[]{new HomeGroup("main.systemFolders",value.Where(i=>i.Entry.Id.StartsWith("home-"))),new HomeGroup(SystemLocations.Current.Computer?.Name??"main.home",value.Where(i=>!i.Entry.Id.StartsWith("home-")),SystemLocations.Current.Computer is null)}}.View:items;}
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
        if(!binding&&(!ReferenceEquals(previous,current)||wasGallery!=IsGallery))SelectionChanged?.Invoke(Selection);
    }
    public void SelectAll(){if(IsGallery)gallery.SelectAll();else ActiveView.SelectAll();}
    public void SelectSingle(AssetItem item)
    {
        if(items?.Contains(item)!=true)return;
        if(IsGallery){gallery.SelectSingle(item);return;}
        keyboardSelect=false;binding=true;
        try{ActiveView.SelectedItems.Clear();ActiveView.SelectedItem=item;}finally{binding=false;}
        ActiveView.ScrollIntoView(item,ScrollIntoViewAlignment.Default);
        SelectionChanged?.Invoke(Selection);
    }
    public void ClearSelection(){if(Selection.Count==0)return;if(IsGallery)gallery.Clear();else ActiveView.SelectedItems.Clear();}
    private bool IsBlank(DependencyObject? element)
    {for(var item=element;item is not null&&!ReferenceEquals(item,root);item=Microsoft.UI.Xaml.Media.VisualTreeHelper.GetParent(item))if(item is ListViewItem or GridViewItem or GalleryTile or Button or Microsoft.UI.Xaml.Controls.Primitives.ScrollBar)return false;return true;}
    public void Suspend(bool value){suspended=value;foreach(var tile in Tiles(grid))tile.Suspend(value||grid.Visibility!=Visibility.Visible);gallery.Suspend(value||!IsGallery);}
    private void OnItemDoubleTapped(object sender, DoubleTappedRoutedEventArgs e)
    {
        if ((e.OriginalSource as FrameworkElement)?.DataContext is not AssetItem item || commands is null) return;
        e.Handled=true;commands.Run(() => { commands.Open(item); return Task.CompletedTask; });
    }
    private void Context(object sender, RightTappedRoutedEventArgs e)
    {
        if (commands is null || (e.OriginalSource as FrameworkElement)?.DataContext is not AssetItem item) return;
        e.Handled = true; var view = (ListViewBase)sender;
        if (!view.SelectedItems.Contains(item)) { view.SelectedItems.Clear(); view.SelectedItem = item; }
        commands.Menu(Selection,home).ShowAt(view, new Microsoft.UI.Xaml.Controls.Primitives.FlyoutShowOptions { Position = e.GetPosition(view) });
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
