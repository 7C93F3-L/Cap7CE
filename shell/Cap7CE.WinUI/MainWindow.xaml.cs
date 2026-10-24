using Cap7CE.WinUI.Controllers;
using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Services;
using Cap7CE.WinUI.Themes;
using Cap7CE.WinUI.Views;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Windows.Storage.Pickers;
using Windows.System;

namespace Cap7CE.WinUI;
public sealed partial class MainWindow : Window
{
    private readonly ShellServices services;
    private readonly FileCommands commands;
    private readonly SidebarView sidebar=new();
    private readonly WorkspaceToolbar toolbar=new();
    private readonly FilterBar filters=new();
    private readonly ResultsView results=new();
    private readonly WorkspaceNotice notifications=new();
    private readonly DetailsPane details;
    private readonly WorkspaceLayoutController layout;
    private readonly WorkspacePointerInput pointerInput;
    private readonly FilterAvailabilityService filterAvailability;
    private readonly WorkspacePreferencesController workspace;
    private readonly PreviewSelectionController<Models.AssetItem> previewLink;
    private SettingsWindow? settings;
    private MaintenanceWindow? maintenance;
    private PreviewWindow? preview;
    private BrowseSession? active;
    private BrowseSession? boundSession;
    private bool catalogRefreshQueued;
    private Models.ShellPreferences? appliedPreferences;
    private bool closed,started,minimized;
    public MainWindow()
    {
        InitializeComponent();MainWindowGeometry.ApplyDefault(this);
        services=new(Environment.GetEnvironmentVariable("CAP7CE_PHASEF_ROOT")??FindRoot());
        workspace=new(services,()=>active,results,toolbar);
        services.CatalogChanged+=roots=>DispatcherQueue.TryEnqueue(()=>{if(!closed){
            foreach(var tab in Tabs.TabItems.OfType<TabViewItem>())if(tab.Tag is BrowseSession {UsesCatalogResults:true} session&&Models.CatalogRefreshRules.Affects(session.PathValue,roots))session.Invalidate();
            QueueCatalogRefresh();
            if(active is not null&&Models.CatalogRefreshRules.Affects(active.PathValue,roots))filterAvailability?.Update(active,true);
        }});
        services.BackgroundError+=text=>DispatcherQueue.TryEnqueue(()=>{if(!closed)Notice(text);});
        services.MaintenanceRequested+=OpenMaintenance;
        filterAvailability=new(services,state=>DispatcherQueue.TryEnqueue(()=>{if(!closed&&filterAvailability?.IsCurrent(state)==true)filters.SetAvailability(state);}));
        commands=new(services,()=>Root.XamlRoot,Notice);details=new(services,commands,Notice);
        previewLink=new(item=>item.FullPath,item=>!item.Entry.IsDirectory,results.SelectSingle,item=>preview?.FollowSelection(item),()=>preview?.Close());
        layout=new(this,Surface,Root,SidebarColumn,DetailsColumn,SidebarHost,FilterHost,MainBorder,DetailsBorder,sidebar,SidebarSizer,DetailsSizer,services.Preferences,Notice);
        layout.DetailsVisibilityChanged+=visible=>{if(!visible)details.Stop();else if(!minimized)details.Select(results.Selection);};
        layout.HorizontalGridChanged+=value=>{results.SetHorizontal(value);toolbar.SetCompact(value);};
        results.SetHorizontal(layout.HorizontalGrid);toolbar.SetCompact(layout.HorizontalGrid);
        SidebarHost.Content=sidebar;ToolbarHost.Content=toolbar;FilterHost.Content=filters;ResultsHost.Content=results;DetailsHost.Content=details;
        NoticeHost.Content=notifications;
        results.Configure(commands);results.SelectionChanged+=items=>{if(DetailsBorder.Visibility==Visibility.Visible)details.Select(items);previewLink.SelectionChanged(active,items);QueueCatalogRefresh();};
        services.VisualMaintenance+=busy=>{if(busy){preview?.Close();details.Stop();}results.Suspend(busy||minimized);if(!busy)Refresh();};
        results.Retry+=Refresh;results.ClearFilters+=()=>{if(active is null)return;active.Query="";active.Filter=new();Refresh();};toolbar.Failure+=Notice;
        sidebar.Navigate+=OpenLocation;sidebar.AddFavorite+=()=>ChooseFolder(true);sidebar.Settings+=OpenSettings;
        sidebar.ToggleFilters+=()=>commands.Run(()=>layout.ToggleAsync(true));sidebar.ToggleDetails+=()=>commands.Run(()=>layout.ToggleAsync(false));
        sidebar.Bind(services.Favorites,commands,()=>Root.XamlRoot);
        services.Shortcuts=new(this,()=>{WindowActivation.Show(this);toolbar.FocusSearch();},()=>{MainWindowGeometry.RestoreDefault(this);WindowActivation.Show(this);},OpenSettings,
            ()=>{var paths=new[]{""}.Concat(services.Favorites.Items.Select(f=>f.Path)).ToArray();OpenLocation(paths[(Array.IndexOf(paths,active?.PathValue??"")+1)%paths.Length]);},error=>Notice(error.Message));
        toolbar.ViewSelected+=mode=>commands.Run(()=>workspace.UpdateAsync(value=>value with{
            View=mode==Models.WorkspaceViewMode.List?"list":"grid",
            SquareTiles=mode==Models.WorkspaceViewMode.List?value.SquareTiles:mode==Models.WorkspaceViewMode.Square}));
        toolbar.SizeChangedByUser+=workspace.PreviewSize;
        toolbar.SizeCommitted+=(size,scope)=>commands.Run(()=>workspace.UpdateAsync(value=>value with{TileSize=size},capturedScope:scope));
        toolbar.OptionsChanged+=update=>commands.Run(()=>workspace.UpdateAsync(update,true));
        filters.FilterChanged+=filter=>{if(active is null)return;active.Filter=filter;Refresh();};
        Tabs.AddTabButtonClick+=(_,_)=>NewTab("");Tabs.TabCloseRequested+=(_,e)=>CloseTab(e.Tab);
        Tabs.SelectionChanged+=(_,_)=>{if(Tabs.SelectedItem is TabViewItem {Tag:BrowseSession session}){var changed=session.SyncWorkspaceOptions();active=session;Bind();if(changed)Refresh();else QueueCatalogRefresh();}};
        commands.NavigateRequested+=path=>{if(active is not null){active.Query="";commands.Run(()=>active.NavigateAsync(path));}};
        commands.PreviewRequested+=ShowPreview;
        commands.CanEditKeywords=()=>DetailsBorder.Visibility==Visibility.Visible;commands.EditKeywordsRequested+=details.EditKeywords;
        commands.BeforeMutation+=()=>{preview?.Close();details.Stop();results.Suspend(true);};
        commands.ItemsDeleted+=()=>{foreach(var tab in Tabs.TabItems.OfType<TabViewItem>())(tab.Tag as BrowseSession)?.RemoveDeleted();};
        commands.AfterMutation+=()=>{results.Suspend(minimized);if(!minimized&&DetailsBorder.Visibility==Visibility.Visible)details.Select(results.Selection);};
        WorkspacePointerInput.PreserveSelection(DetailsBorder);WorkspacePointerInput.PreserveSelection(NoticeHost);
        pointerInput=new(Surface,results.ClearSelection,forward=>{if(active is {} session)commands.Run(()=>forward?session.ForwardAsync():session.BackAsync());});
        Surface.KeyDown+=KeyDown;
        services.Preferences.Changed+=ApplyPreferences;
        AppWindow.Changed+=(_,_)=>{
            var next=AppWindow.Presenter is Microsoft.UI.Windowing.OverlappedPresenter p&&p.State==Microsoft.UI.Windowing.OverlappedPresenterState.Minimized;
            if(minimized==next)return;minimized=next;results.Suspend(next);if(next)details.Stop();else {details.Select(results.Selection);QueueCatalogRefresh();}
        };
        Closed+=OnClosed;Root.Loaded+=async(_,_)=>{if(started)return;started=true;await StartAsync();};
    }
    private async Task StartAsync()
    {
        try{await services.Preferences.LoadAsync();ApplyPreferences();}catch(Exception error){Notice("偏好读取失败："+error.Message);}
        try{services.Notifications.Configure(services.Preferences.Current.Notifications);}catch(Exception error){Notice("通知注册失败："+error.Message);}
        try{services.Shortcuts?.Configure(services.Preferences.Current.QuickActions);}catch(Exception error){Notice(error.Message);}
        AssetTile.Visuals=services.Visuals;NewTab("");
        try{await services.Favorites.ExecuteAsync();}catch(Exception error){Notice("收藏读取失败："+error.Message);}
        // Core readiness updates capabilities; it must not replace user navigation
        // or cancel directory reads started while the connection was pending.
        try{await services.ConnectAsync();if(!closed&&active is not null)filterAvailability.Update(active,true);}catch(Exception error){Notice(error.Message);}
    }
    private void NewTab(string path,bool favorite=false)
    {
        if(Tabs.TabItems.Count>=12){Notice("最多打开12个目录标签");return;}
        var session=new BrowseSession(services);
        session.NavigationStarting+=preserve=>previewLink.NavigationStarting(session,preserve);
        var tab=new TabViewItem {Header=path.Length==0?"此电脑":Path.GetFileName(path.TrimEnd('\\')),Tag=session,IconSource=new SymbolIconSource {Symbol=path.Length==0?Symbol.Home:Symbol.Folder}};
        session.Changed+=()=>{if(closed)return;tab.Header=session.Title;if(ReferenceEquals(active,session))Bind();};
        Tabs.TabItems.Add(tab);Tabs.SelectedItem=tab;commands.Run(()=>session.OpenLocationAsync(path,favorite));
        Tabs.Visibility=Tabs.TabItems.Count>1?Visibility.Visible:Visibility.Collapsed;
    }
    private void CloseTab(TabViewItem tab)
    {
        if(tab.Tag is BrowseSession session)session.Dispose();Tabs.TabItems.Remove(tab);
        if(Tabs.TabItems.Count==0&&!closed)NewTab("");
        Tabs.Visibility=Tabs.TabItems.Count>1?Visibility.Visible:Visibility.Collapsed;
    }
    private void Bind()
    {
        if(active is null||closed)return;
        previewLink.ContextChanged(active);
        workspace.Apply();
        sidebar.SetActivePath(active.PathValue);toolbar.Bind(active);filters.Restore(active.Filter);filterAvailability.Update(active);
        var preserveSelection=ReferenceEquals(boundSession,active)&&active.PreserveSelection;boundSession=active;
        results.Bind(active.Items,active.PathValue.Length==0&&active.Query.Trim().Length==0&&active.Filter.Count==0&&!active.Random,active.Busy,active.Error,active.Filter.Count>0||active.Query.Trim().Length>0,preserveSelection);
        details.SetContext(active.PathValue,active.Busy?null:active.Items.TotalCount??(!active.Items.HasMoreItems?(long?)active.Items.Count:null),active.Filter.Count>0||active.Query.Trim().Length>0,active.Filter.Count);
        notifications.SetBusy(active.Busy);if(active.Error is {} error&&active.Items.Count>0)Notice(error);
        if(!active.Busy)QueueCatalogRefresh();
    }
    private void Refresh(){if(active is not null)commands.Run(()=>active.NavigateAsync(active.PathValue,false));}
    private void QueueCatalogRefresh()
    {
        if(closed||catalogRefreshQueued)return;catalogRefreshQueued=true;
        DispatcherQueue.TryEnqueue(()=>{
            catalogRefreshQueued=false;
            if(closed||active is not {UsesCatalogResults:true} session||!Models.CatalogRefreshRules.CanRefresh(session.Invalidated,session.Busy,results.Selection.Count,preview is not null,minimized))return;
            commands.Run(()=>session.NavigateAsync(session.PathValue,false,true));
        });
    }
    private void OpenLocation(string path)
    {
        // Navigation entry always returns to the requested root with fresh query state.
        var favorite=path.Length>0&&services.Favorites.Items.Any(item=>string.Equals(item.Path.TrimEnd('\\','/'),path.TrimEnd('\\','/'),StringComparison.OrdinalIgnoreCase));
        if(active is null){NewTab(path,favorite);return;}commands.Run(()=>active.OpenLocationAsync(path,favorite));
    }
    private async void ChooseFolder(bool favorite)
    {
        try
        {
            var picker=new FolderPicker();picker.FileTypeFilter.Add("*");WinRT.Interop.InitializeWithWindow.Initialize(picker,WinRT.Interop.WindowNative.GetWindowHandle(this));
            if(await picker.PickSingleFolderAsync() is not { } folder)return;FileAccessGuard.RejectLinks(folder.Path);
            if(favorite)await services.Favorites.ExecuteAsync("add",path:folder.Path);else NewTab(folder.Path);
        }
        catch(Exception error){Notice(error.Message);}
    }
    private void ShowPreview(Models.AssetItem item)
    {
        if(preview is null){preview=new(services,this);preview.CurrentChanged+=previewLink.PreviewChanged;preview.Closed+=(_,_)=>{previewLink.Detach();preview=null;QueueCatalogRefresh();};}
        IReadOnlyList<Models.AssetItem> source=active?.Items??[item];
        if(active is not null)previewLink.Open(active,source,item);
        preview.Show(item,source);
    }
    private void OpenSettings()
    {if(settings is null){settings=new(services);settings.Closed+=(_,_)=>settings=null;}WindowActivation.Show(settings);}
    private void OpenMaintenance(string? path)
    {
        if(maintenance is null){maintenance=new(services);maintenance.Closed+=(_,_)=>maintenance=null;}
        if(path is not null)maintenance.SetDirectory(path);WindowActivation.Show(maintenance);
    }
    private void ApplyPreferences()=>DispatcherQueue.TryEnqueue(()=>{
        if(closed)return;var prefs=services.Preferences.Current;
        var pinOnly=appliedPreferences is { } previous&&(previous with{AlwaysOnTop=prefs.AlwaysOnTop,PreviewAlwaysOnTop=prefs.PreviewAlwaysOnTop})==prefs;
        var workspaceOnly=appliedPreferences is {} old&&(old with{ComputerWorkspace=prefs.ComputerWorkspace,FavoriteWorkspace=prefs.FavoriteWorkspace})==prefs;
        if(!pinOnly&&!workspaceOnly){ThemeService.Apply(this,Surface,prefs);layout.ApplyPreferences();}
        workspace.Apply();
        WindowTitleBar.ConfigurePin(this,prefs.AlwaysOnTop,SetPinned);appliedPreferences=prefs;
    });
    private void SetPinned(bool value)=>commands.Run(async()=>{
        try{await services.Preferences.UpdateAsync(prefs=>prefs with{AlwaysOnTop=value});}
        catch{ApplyPreferences();throw;}
    });
    private void Notice(string text){if(!closed)notifications.ShowMessage(text);}
    private void KeyDown(object sender,KeyRoutedEventArgs e)
    {
        var control=Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Control).HasFlag(Windows.UI.Core.CoreVirtualKeyStates.Down);
        var alt=Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Menu).HasFlag(Windows.UI.Core.CoreVirtualKeyStates.Down);
        if(control&&e.Key is VirtualKey.F or VirtualKey.L or VirtualKey.O or VirtualKey.T or VirtualKey.W)
        {
            e.Handled=true;switch(e.Key){case VirtualKey.F:toolbar.FocusSearch();break;case VirtualKey.L:toolbar.FocusPath();break;case VirtualKey.O:ChooseFolder(false);break;case VirtualKey.T:NewTab("");break;case VirtualKey.W:if(Tabs.SelectedItem is TabViewItem tab)CloseTab(tab);break;}return;
        }
        if(e.OriginalSource is TextBox||e.OriginalSource is AutoSuggestBox)return;
        if(alt&&active is not null&&e.Key is VirtualKey.Left or VirtualKey.Right){e.Handled=true;commands.Run(()=>e.Key==VirtualKey.Left?active.BackAsync():active.ForwardAsync());return;}
        if(e.Key==VirtualKey.F5){e.Handled=true;Refresh();return;}
        if(e.Key!=VirtualKey.Escape&&e.OriginalSource is DependencyObject source&&(filters.ContainsKeyboardTarget(source)||toolbar.ContainsKeyboardTarget(source)))return;
        if(e.Key==VirtualKey.Escape){e.Handled=true;if(!sidebar.CancelOrder())results.ClearSelection();return;}
        if(control&&e.Key==VirtualKey.A){e.Handled=true;results.SelectAll();return;}
        var selection=results.Selection;if(selection.Count==0)return;
        if(control&&e.Key==VirtualKey.C){e.Handled=true;commands.Run(()=>FileCommands.CopyFilesAsync(selection));}
        else if(e.Key==VirtualKey.Space){e.Handled=true;commands.Run(()=>{commands.Preview(selection[0]);return Task.CompletedTask;});}
        else if(e.Key==VirtualKey.Enter){e.Handled=true;commands.Run(()=>{commands.Open(selection[0]);return Task.CompletedTask;});}
        else if(e.Key==VirtualKey.Delete&&selection.All(i=>i.Entry.FileReference is not null)){e.Handled=true;commands.Run(()=>commands.DeleteAsync(selection));}
    }
    private async void OnClosed(object sender,WindowEventArgs e)
    {
        closed=true;pointerInput.Dispose();notifications.Dispose();filterAvailability.Dispose();services.Preferences.Changed-=ApplyPreferences;layout.Dispose();details.Stop();preview?.Close();settings?.Close();maintenance?.Close();AssetTile.Visuals=null;
        foreach(var tab in Tabs.TabItems.OfType<TabViewItem>())(tab.Tag as BrowseSession)?.Dispose();
        try{await services.DisposeAsync();}catch{}
    }
    private static string FindRoot()
    {
        for(var directory=new DirectoryInfo(AppContext.BaseDirectory);directory is not null;directory=directory.Parent)
            if(File.Exists(Path.Combine(directory.FullName,"cap7ce-native.json"))||File.Exists(Path.Combine(directory.FullName,"package.json"))&&Directory.Exists(Path.Combine(directory.FullName,"core")))return directory.FullName;
        return AppContext.BaseDirectory;
    }
}
