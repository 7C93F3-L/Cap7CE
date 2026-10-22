using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Cap7CE.WinUI.Controllers;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Themes;
namespace Cap7CE.WinUI.Controls;
internal sealed class WorkspaceToolbar : UserControl
{
    private readonly WorkspaceAddress address=new();
    private readonly Grid root=new(){ColumnSpacing=4,Padding=new(8,2,8,2)};
    private readonly StackPanel navigation,tools;
    private readonly Button back,forward,up,refresh,next,sort,view,sizeButton,recursive,hidden;
    private readonly ToggleButton random;
    private readonly FilterFlyouts flyouts=new();
    private BrowseSession? session;
    private double tileSize=160;
    private WorkspaceViewMode viewMode;
    private bool compact;
    private MenuFlyout? viewMenu;
    public event Action<WorkspaceViewMode>? ViewSelected;
    public event Action<double>? SizeChangedByUser,SizeCommitted;
    public event Action<string>? Failure;
    public WorkspaceToolbar()
    {
        root.ColumnDefinitions.Add(new(){Width=GridLength.Auto});root.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});root.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        back=WorkspaceIcons.Button("back","返回 · Alt+←",()=>Run(()=>session!.BackAsync()));
        forward=WorkspaceIcons.Button("forward","前进 · Alt+→",()=>Run(()=>session!.ForwardAsync()));
        up=WorkspaceIcons.Button("up","上一级",()=>Run(()=>session!.UpAsync()));
        refresh=WorkspaceIcons.Button("refresh","刷新 · F5",Reload);navigation=Ui.Row(back,forward,up,refresh);navigation.Spacing=2;root.Children.Add(navigation);
        Grid.SetColumn(address,1);root.Children.Add(address);
        address.Navigate+=path=>{if(session is null)return;session.Query="";if(path.Length==0)session.Filter=new();Run(()=>session.NavigateAsync(path));};
        address.Search+=query=>{if(session is null)return;session.Query=query;Reload();};
        random=WorkspaceIcons.Toggle("shuffle","随机浏览",()=>{if(session is null)return;session.Random=!session.Random;if(session.Random)session.Seed=(uint)System.Random.Shared.Next();Reload();});
        next=WorkspaceIcons.Button("refresh","换一批",()=>{if(session is null)return;session.Seed=(uint)System.Random.Shared.Next();Reload();});
        sizeButton=WorkspaceIcons.Button("size","网格大小",ShowSize);WorkspacePointerInput.PreserveSelection(sizeButton);
        view=WorkspaceIcons.Button("grid","视图",ShowView);sort=WorkspaceIcons.Button("sort","排序",ShowSort);
        recursive=WorkspaceIcons.Button("tree","包含子文件夹",()=>{if(session is null)return;Run(()=>session.ToggleRecursiveAsync());});
        hidden=WorkspaceIcons.Button("eyeOff","显示隐藏项",()=>{if(session is null)return;session.ShowHidden=!session.ShowHidden;Reload();});
        var separator=new Border{Style=(Style)Application.Current.Resources["CapWorkspaceToolSeparator"],IsHitTestVisible=false};
        tools=Ui.Row(random,next,separator,sizeButton,view,sort,recursive,hidden);tools.Spacing=2;Grid.SetColumn(tools,2);root.Children.Add(tools);
        navigation.VerticalAlignment=tools.VerticalAlignment=VerticalAlignment.Center;
        root.SizeChanged+=(_,_)=>Reflow();Unloaded+=(_,_)=>{flyouts.Close();viewMenu?.Hide();};
        Content=new Border{Style=(Style)Application.Current.Resources["CapWorkspaceToolbar"],Child=root};
    }
    public void Bind(BrowseSession value)
    {
        var reset=!ReferenceEquals(session,value);session=value;address.Bind(value.PathValue,value.Query,reset);
        back.IsEnabled=value.CanBack;forward.IsEnabled=value.CanForward;up.IsEnabled=value.PathValue.Length>0;refresh.IsEnabled=!value.Busy;
        random.IsChecked=value.Random;next.IsEnabled=!value.Busy;recursive.IsEnabled=value.PathValue.Length>0;
        ((SidebarIcon)recursive.Content).OutlinePath=WorkspaceIcons.Icon(value.Recursive?"files":"tree").OutlinePath;
        ((SidebarIcon)hidden.Content).OutlinePath=WorkspaceIcons.Icon(value.ShowHidden?"eye":"eyeOff").OutlinePath;
        WorkspaceIcons.Label(random,$"随机浏览 · {(value.Random?"开启":"关闭")}");WorkspaceIcons.Label(recursive,$"包含子文件夹 · {(value.Recursive?"开启 · 再次点击取消":"关闭")}{(value.PathValue.Length==0?" · 请先进入目录":value.FilesystemBrowsing?" · 文件系统逐层读取，各目录内排序":"")}");
        WorkspaceIcons.Label(hidden,$"显示隐藏项 · {(value.ShowHidden?"开启":"关闭")}");WorkspaceIcons.Label(sort,value.Random?"排序 · 随机浏览":$"排序 · {SortLabel(value.Sort)}");Reflow();
    }
    public void ApplyPreferences(ShellPreferences value)
    {
        tileSize=value.TileSize;
        viewMode=value.View=="list"?WorkspaceViewMode.List:value.SquareTiles?WorkspaceViewMode.Square:WorkspaceViewMode.OriginalRatio;
        WorkspaceIcons.Label(sizeButton,$"网格大小 · {value.TileSize:0} DIP");ApplyViewState();
    }
    public void SetCompact(bool value)
    {
        compact=value;if(compact)viewMenu?.Hide();ApplyViewState();
    }
    private void ApplyViewState()
    {
        view.IsEnabled=!compact;
        ((SidebarIcon)view.Content).OutlinePath=WorkspaceIcons.Icon(!compact&&viewMode==WorkspaceViewMode.List?"list":"grid").OutlinePath;
        WorkspaceIcons.Label(view,compact?"低高度下使用横向网格，拉高窗口后恢复原视图":$"视图 · 当前：{ViewLabel(viewMode)}");
    }
    private void Reflow()
    {
        var narrow=root.ActualWidth<=560;navigation.Visibility=narrow?Visibility.Collapsed:Visibility.Visible;
        tools.Visibility=narrow?Visibility.Collapsed:Visibility.Visible;root.ColumnSpacing=narrow?0:4;
        next.Visibility=!narrow&&session?.Random==true?Visibility.Visible:Visibility.Collapsed;if(narrow){flyouts.Close();viewMenu?.Hide();}
    }
    public void FocusSearch()=>address.FocusSearch();
    public void FocusPath()=>address.FocusPath();
    public bool ContainsKeyboardTarget(DependencyObject target)
    {for(DependencyObject? item=target;item is not null;item=Microsoft.UI.Xaml.Media.VisualTreeHelper.GetParent(item))if(ReferenceEquals(item,this))return true;return false;}
    private void Reload(){if(session is not null)Run(()=>session.NavigateAsync(session.PathValue,false));}
    private async void Run(Func<Task> action){if(session is null)return;try{await action();}catch(Exception error){Failure?.Invoke(error.Message);}}
    private static string ViewLabel(WorkspaceViewMode mode)=>mode switch {WorkspaceViewMode.List=>"列表",WorkspaceViewMode.OriginalRatio=>"原比例网格",_=>"方形网格"};
    private void ShowView()
    {
        if(compact)return;
        flyouts.Close();viewMenu?.Hide();var menu=ThemeService.Menu();viewMenu=menu;
        menu.Closed+=(_,_)=>{if(ReferenceEquals(viewMenu,menu))viewMenu=null;};
        foreach(var mode in Enum.GetValues<WorkspaceViewMode>()) {
            var option=new RadioMenuFlyoutItem {Text=ViewLabel(mode),IsChecked=mode==viewMode,GroupName="workspace-view"};
            option.Click+=(_,_)=>{if(!compact&&mode!=viewMode)ViewSelected?.Invoke(mode);};menu.Items.Add(option);
        }
        menu.ShowAt(view,new FlyoutShowOptions{Placement=FlyoutPlacementMode.Bottom});
    }
    private void ShowSize()
    {
        flyouts.Close();
        var picker=new GridSizePicker(tileSize,value=>{tileSize=value;SizeChangedByUser?.Invoke(value);});
        flyouts.Show(sizeButton,picker,()=>SizeCommitted?.Invoke(picker.Value));
    }
    private static string SortLabel(string value)=>value switch {"name-descending"=>"名称 · 降序","modified-descending"=>"修改时间 · 降序","modified-ascending"=>"修改时间 · 升序",_=>"名称 · 升序"};
    private void ShowSort()
    {
        if(session is null)return;var menu=ThemeService.Menu();
        foreach(var value in new[]{"name-ascending","name-descending","modified-descending","modified-ascending"}) {
            var option=new RadioMenuFlyoutItem{Text=SortLabel(value),IsChecked=!session.Random&&session.Sort==value,GroupName="sort"};
            option.Click+=(_,_)=>{session.Sort=value;session.Random=false;Reload();};menu.Items.Add(option);
        }
        menu.ShowAt(sort,new FlyoutShowOptions{Placement=FlyoutPlacementMode.Bottom});
    }
}
