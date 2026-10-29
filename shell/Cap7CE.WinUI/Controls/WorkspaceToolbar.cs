using Microsoft.UI.Xaml;
using Cap7CE.WinUI.Localization;
using L=Cap7CE.WinUI.Localization.LanguageUi;
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
    private long addressRevision=-1;
    private MenuFlyout? viewMenu;
    public event Action<WorkspaceViewMode>? ViewSelected;
    public event Action<double>? SizeChangedByUser;
    public event Action<double,WorkspacePreferenceScope>? SizeCommitted;
    public event Action<Func<WorkspaceOptions,WorkspaceOptions>>? OptionsChanged;
    public event Action<UiMessage>? Failure;
    public WorkspaceToolbar()
    {
        root.ColumnDefinitions.Add(new(){Width=GridLength.Auto});root.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});root.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        back=WorkspaceIcons.ResourceButton("back","main.back",()=>Run(()=>session!.BackAsync()));
        forward=WorkspaceIcons.ResourceButton("forward","main.forward",()=>Run(()=>session!.ForwardAsync()));
        up=WorkspaceIcons.ResourceButton("up","main.up",()=>Run(()=>session!.UpAsync()));
        refresh=WorkspaceIcons.ResourceButton("refresh","main.refresh",Reload);navigation=Ui.Row(back,forward,up,refresh);navigation.Spacing=2;root.Children.Add(navigation);
        Grid.SetColumn(address,1);root.Children.Add(address);
        address.Navigate+=path=>{if(session is null)return;session.Query="";if(path.Length==0)session.Filter=new();Run(()=>session.NavigateAsync(path));};
        address.Search+=query=>{if(session is null)return;session.Query=query;Reload();};
        random=WorkspaceIcons.ResourceToggle("shuffle","main.random",()=>{if(session is null)return;session.Random=!session.Random;if(session.Random)session.Seed=(uint)System.Random.Shared.Next();Reload();});
        next=WorkspaceIcons.ResourceButton("refresh","main.next",()=>{if(session is null)return;session.Seed=(uint)System.Random.Shared.Next();Reload();});
        sizeButton=WorkspaceIcons.ResourceButton("size","main.gridSize",ShowSize);WorkspacePointerInput.PreserveSelection(sizeButton);
        view=WorkspaceIcons.ResourceButton("grid","main.view",ShowView);sort=WorkspaceIcons.ResourceButton("sort","main.sort",ShowSort);
        recursive=WorkspaceIcons.ResourceButton("tree","main.recursive",()=>OptionsChanged?.Invoke(value=>value with{Recursive=!value.Recursive}));
        hidden=WorkspaceIcons.ResourceButton("eyeOff","main.hidden",()=>OptionsChanged?.Invoke(value=>value with{ShowHidden=!value.ShowHidden}));
        var separator=new Border{Style=(Style)Application.Current.Resources["CapWorkspaceToolSeparator"],IsHitTestVisible=false};
        tools=Ui.Row(random,next,separator,sizeButton,view,recursive,sort,hidden);tools.Spacing=2;Grid.SetColumn(tools,2);root.Children.Add(tools);
        navigation.VerticalAlignment=tools.VerticalAlignment=VerticalAlignment.Center;
        root.SizeChanged+=(_,_)=>Reflow();Unloaded+=(_,_)=>{flyouts.Close();viewMenu?.Hide();};
        Content=new Border{Style=(Style)Application.Current.Resources["CapWorkspaceToolbar"],Child=root};
    }
    public void Bind(BrowseSession value)
    {
        var reset=!ReferenceEquals(session,value)||addressRevision!=value.AddressRevision;
        if(reset){flyouts.Close();viewMenu?.Hide();}
        session=value;addressRevision=value.AddressRevision;address.Bind(value.PathValue,value.Query,reset,WorkspaceOptions.SearchByDefault(value.PreferenceScope));
        back.IsEnabled=value.CanBack;forward.IsEnabled=value.CanForward;up.IsEnabled=value.PathValue.Length>0;refresh.IsEnabled=!value.ForegroundBusy;
        random.IsChecked=value.Random;next.IsEnabled=!value.ForegroundBusy;recursive.IsEnabled=value.PathValue.Length>0;
        ((SidebarIcon)recursive.Content).OutlinePath=WorkspaceIcons.Icon(value.Recursive?"files":"tree").OutlinePath;
        ((SidebarIcon)hidden.Content).OutlinePath=WorkspaceIcons.Icon(value.ShowHidden?"eye":"eyeOff").OutlinePath;
        L.Label(random,"main.randomStatus",()=>new Dictionary<string,object?>{{"state",AppLanguage.Text(value.Random?"main.on":"main.off")}});
        L.Label(recursive,value.PathValue.Length==0?"main.enterFolder":"main.recursiveStatus",()=>new Dictionary<string,object?>{{"state",AppLanguage.Text(value.Recursive?"main.on":"main.off")}});
        L.Label(hidden,"main.hiddenStatus",()=>new Dictionary<string,object?>{{"state",AppLanguage.Text(value.ShowHidden?"main.on":"main.off")}});
        if(value.Random)L.Label(sort,"main.sortRandom");else L.Label(sort,"main.sortStatus",()=>new Dictionary<string,object?>{{"sort",AppLanguage.Text(SortKey(value.Sort))}});Reflow();
    }
    public void ApplyPreferences(ShellPreferences value)
    {
        tileSize=value.TileSize;
        viewMode=value.View=="list"?WorkspaceViewMode.List:value.SquareTiles?WorkspaceViewMode.Square:WorkspaceViewMode.OriginalRatio;
        L.Label(sizeButton,"main.gridSizeStatus",()=>new Dictionary<string,object?>{{"size",value.TileSize}});ApplyViewState();
    }
    public void SetCompact(bool value)
    {
        compact=value;if(compact)viewMenu?.Hide();ApplyViewState();
    }
    private void ApplyViewState()
    {
        view.IsEnabled=!compact;
        ((SidebarIcon)view.Content).OutlinePath=WorkspaceIcons.Icon(!compact&&viewMode==WorkspaceViewMode.List?"list":"grid").OutlinePath;
        if(compact)L.Label(view,"main.compactView");else L.Label(view,"main.viewStatus",()=>new Dictionary<string,object?>{{"view",AppLanguage.Text(ViewKey(viewMode))}});
    }
    private void Reflow()
    {
        var narrow=root.ActualWidth<=560;navigation.Visibility=narrow?Visibility.Collapsed:Visibility.Visible;
        tools.Visibility=narrow?Visibility.Collapsed:Visibility.Visible;root.ColumnSpacing=narrow?0:4;
        next.Visibility=!narrow&&session?.Random==true?Visibility.Visible:Visibility.Collapsed;if(narrow){flyouts.Close();viewMenu?.Hide();}
    }
    public Func<string,bool>? CommandSubmitted {get=>address.CommandSubmitted;set=>address.CommandSubmitted=value;}
    public event Action? CommandCancelled {add=>address.CommandCancelled+=value;remove=>address.CommandCancelled-=value;}
    public void CommandInput(string? text,bool busy=false)=>address.CommandInput(text,busy);
    public void FocusSearch()=>address.FocusSearch();
    public void FocusPath()=>address.FocusPath();
    public bool ContainsKeyboardTarget(DependencyObject target)
    {for(DependencyObject? item=target;item is not null;item=Microsoft.UI.Xaml.Media.VisualTreeHelper.GetParent(item))if(ReferenceEquals(item,this))return true;return false;}
    private void Reload(){if(session is not null)Run(()=>session.NavigateAsync(session.PathValue,false));}
    private async void Run(Func<Task> action){if(session is null)return;try{await action();}catch(Exception error){Failure?.Invoke(FailureText.From(error));}}
    private static string ViewKey(WorkspaceViewMode mode)=>mode switch {WorkspaceViewMode.List=>"main.viewList",WorkspaceViewMode.OriginalRatio=>"main.viewOriginal",_=>"main.viewSquare"};
    private void ShowView()
    {
        if(compact)return;
        flyouts.Close();viewMenu?.Hide();var menu=ThemeService.Menu();viewMenu=menu;
        menu.Closed+=(_,_)=>{if(ReferenceEquals(viewMenu,menu))viewMenu=null;};
        foreach(var mode in Enum.GetValues<WorkspaceViewMode>()) {
            var option=new RadioMenuFlyoutItem {IsChecked=mode==viewMode,GroupName="workspace-view"};
            L.Bind(option,RadioMenuFlyoutItem.TextProperty,ViewKey(mode));option.Click+=(_,_)=>{if(!compact&&mode!=viewMode)ViewSelected?.Invoke(mode);};menu.Items.Add(option);
        }
        menu.ShowAt(view,new FlyoutShowOptions{Placement=FlyoutPlacementMode.Bottom});
    }
    private void ShowSize()
    {
        flyouts.Close();
        var scope=session?.PreferenceScope??WorkspacePreferenceScope.Computer;
        var picker=new GridSizePicker(tileSize,value=>{tileSize=value;SizeChangedByUser?.Invoke(value);});
        flyouts.Show(sizeButton,picker,()=>SizeCommitted?.Invoke(picker.Value,scope));
    }
    private static string SortKey(string value)=>value switch {"name-descending"=>"main.sortNameDesc","modified-descending"=>"main.sortModifiedDesc","modified-ascending"=>"main.sortModifiedAsc",_=>"main.sortNameAsc"};
    private void ShowSort()
    {
        if(session is null)return;var menu=ThemeService.Menu();
        foreach(var value in new[]{"name-ascending","name-descending","modified-descending","modified-ascending"}) {
            var option=new RadioMenuFlyoutItem{IsChecked=!session.Random&&session.Sort==value,GroupName="sort"};
            L.Bind(option,RadioMenuFlyoutItem.TextProperty,SortKey(value));option.Click+=(_,_)=>{session.Random=false;OptionsChanged?.Invoke(current=>current with{Sort=value});};menu.Items.Add(option);
        }
        menu.ShowAt(sort,new FlyoutShowOptions{Placement=FlyoutPlacementMode.Bottom});
    }
}
