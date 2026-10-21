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
    public event Action? OpenFolder,ViewChanged,GridModeChanged,ToggleFilters,ToggleDetails,OpenSettings;
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
        sizeButton=WorkspaceIcons.Button("size","网格大小",ShowSize);
        view=WorkspaceIcons.Button("grid","方形 / 原比例网格",()=>GridModeChanged?.Invoke());sort=WorkspaceIcons.Button("sort","排序",ShowSort);
        recursive=WorkspaceIcons.Button("tree","包含子文件夹",()=>{if(session is null)return;session.Recursive=!session.Recursive;Reload();});
        hidden=WorkspaceIcons.Button("eyeOff","显示隐藏项",()=>{if(session is null)return;session.ShowHidden=!session.ShowHidden;Reload();});
        tools=Ui.Row(random,next,sizeButton,view,sort,recursive,hidden,WorkspaceIcons.Button("more","更多浏览操作",Options));tools.Spacing=2;Grid.SetColumn(tools,2);root.Children.Add(tools);
        navigation.VerticalAlignment=tools.VerticalAlignment=VerticalAlignment.Center;
        root.SizeChanged+=(_,_)=>Reflow();Unloaded+=(_,_)=>flyouts.Close();
        Content=new Border{Style=(Style)Application.Current.Resources["CapWorkspaceToolbar"],Child=root};
    }
    public void Bind(BrowseSession value)
    {
        var reset=!ReferenceEquals(session,value);session=value;address.Bind(value.PathValue,value.Query,reset);
        back.IsEnabled=value.CanBack;forward.IsEnabled=value.CanForward;up.IsEnabled=value.PathValue.Length>0;refresh.IsEnabled=!value.Busy;
        random.IsChecked=value.Random;next.IsEnabled=!value.Busy;recursive.IsEnabled=value.PathValue.Length>0;
        ((SidebarIcon)recursive.Content).OutlinePath=WorkspaceIcons.Icon(value.Recursive?"files":"tree").OutlinePath;
        ((SidebarIcon)hidden.Content).OutlinePath=WorkspaceIcons.Icon(value.ShowHidden?"eye":"eyeOff").OutlinePath;
        WorkspaceIcons.Label(random,$"随机浏览 · {(value.Random?"开启":"关闭")}");WorkspaceIcons.Label(recursive,$"包含子文件夹 · {(value.Recursive?"开启":"关闭")}{(value.PathValue.Length==0?" · 请先进入目录":"")}");
        WorkspaceIcons.Label(hidden,$"显示隐藏项 · {(value.ShowHidden?"开启":"关闭")}");WorkspaceIcons.Label(sort,value.Random?"排序 · 随机浏览":$"排序 · {SortLabel(value.Sort)}");Reflow();
    }
    public void ApplyPreferences(ShellPreferences value)
    {
        tileSize=value.TileSize;
        WorkspaceIcons.Label(sizeButton,$"网格大小 · {value.TileSize:0} DIP");WorkspaceIcons.Label(view,$"当前：{(value.SquareTiles?"方形网格":"原比例网格")} · 点击切换");
    }
    private void Reflow()
    {
        var narrow=root.ActualWidth<=560;navigation.Visibility=narrow?Visibility.Collapsed:Visibility.Visible;
        tools.Visibility=narrow?Visibility.Collapsed:Visibility.Visible;root.ColumnSpacing=narrow?0:4;
        next.Visibility=!narrow&&session?.Random==true?Visibility.Visible:Visibility.Collapsed;if(narrow)flyouts.Close();
    }
    public void FocusSearch()=>address.FocusSearch();
    public void FocusPath()=>address.FocusPath();
    public bool ContainsKeyboardTarget(DependencyObject target)
    {for(DependencyObject? item=target;item is not null;item=Microsoft.UI.Xaml.Media.VisualTreeHelper.GetParent(item))if(ReferenceEquals(item,this))return true;return false;}
    private void Reload(){if(session is not null)Run(()=>session.NavigateAsync(session.PathValue,false));}
    private async void Run(Func<Task> action){if(session is null)return;try{await action();}catch(Exception error){Failure?.Invoke(error.Message);}}
    private void ShowSize()
    {
        flyouts.Close();var size=new Slider{Minimum=96,Maximum=280,Value=tileSize,Width=220,StepFrequency=4};var sizeLabel=Ui.Text($"网格大小 · {tileSize:0} DIP");
        size.ValueChanged+=(_,e)=>{tileSize=e.NewValue;sizeLabel.Text=$"网格大小 · {e.NewValue:0} DIP";SizeChangedByUser?.Invoke(e.NewValue);};
        var content=Ui.Column(sizeLabel,size,Ui.Row(Ui.Text("较小",true),Ui.Button("默认",()=>size.Value=160),Ui.Text("较大",true)));
        flyouts.Show(sizeButton,content,()=>SizeCommitted?.Invoke(size.Value));
    }
    private static string SortLabel(string value)=>value switch {"name-descending"=>"名称 · 降序","modified-descending"=>"修改时间 · 降序","modified-ascending"=>"修改时间 · 升序",_=>"名称 · 升序"};
    private void ShowSort()
    {
        if(session is null)return;var menu=ThemeService.Menu();
        foreach(var value in new[]{"name-ascending","name-descending","modified-descending","modified-ascending"}) {
            var option=new RadioMenuFlyoutItem{Text=SortLabel(value),IsChecked=!session.Random&&session.Sort==value,GroupName="sort"};
            option.Click+=(_,_)=>{session.Sort=value;session.Random=false;Reload();};menu.Items.Add(option);
        }
        menu.ShowAt(sort);
    }
    private void Options()
    {
        var menu=ThemeService.Menu();
        void Item(string label,Action action,bool enabled=true){var item=Ui.MenuItem(label,action);item.IsEnabled=enabled;menu.Items.Add(item);}
        Item("搜索 · Ctrl+F",FocusSearch);Item("输入路径 · Ctrl+L",FocusPath);Item("打开目录 · Ctrl+O",()=>OpenFolder?.Invoke());
        Item("返回",()=>Run(()=>session!.BackAsync()),session?.CanBack==true);Item("前进",()=>Run(()=>session!.ForwardAsync()),session?.CanForward==true);Item("上一级",()=>Run(()=>session!.UpAsync()),session?.PathValue.Length>0);Item("刷新 · F5",Reload,session?.Busy==false);
        menu.Items.Add(new MenuFlyoutSeparator());Item("排序",ShowSort);Item("列表 / 网格",()=>ViewChanged?.Invoke());
        void Toggle(string label,bool value,Action action,bool enabled=true){var item=new ToggleMenuFlyoutItem{Text=label,IsChecked=value,IsEnabled=enabled};item.Click+=(_,_)=>action();menu.Items.Add(item);}
        if(session is not null) {
            Toggle("随机浏览",session.Random,()=>{session.Random=!session.Random;if(session.Random)session.Seed=(uint)System.Random.Shared.Next();Reload();});
            if(session.Random)Item("换一批",()=>{session.Seed=(uint)System.Random.Shared.Next();Reload();},!session.Busy);
            Toggle("包含子文件夹",session.Recursive,()=>{session.Recursive=!session.Recursive;Reload();},session.PathValue.Length>0);
            Toggle("显示隐藏项",session.ShowHidden,()=>{session.ShowHidden=!session.ShowHidden;Reload();});
        }
        menu.Items.Add(new MenuFlyoutSeparator());Item("顶部筛选：显示 / 收起",()=>ToggleFilters?.Invoke());Item("详细信息：显示 / 收起",()=>ToggleDetails?.Invoke());Item("打开设置",()=>OpenSettings?.Invoke());menu.ShowAt(this);
    }
}
