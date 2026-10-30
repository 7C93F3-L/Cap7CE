using Cap7CE.WinUI.Controllers;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Localization;
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
    private readonly AutoKeywordNoticeController keywordNotice;
    private readonly IndexNoticeController indexNotice;
    private readonly MetadataNoticeController metadataNotice;
    private readonly MetadataFilterPromptController metadataFilters;
    private readonly EdgeCollapseController edgeCollapse;
    private SettingsWindow? settings;
    private readonly Commands.QuickCommandInput commandInput;
    private readonly TrayController tray;
    private PreviewWindow? preview;
    private readonly BrowseSession active;
    private bool catalogRefreshQueued;
    private Models.ShellPreferences? appliedPreferences;
    private bool closed,minimized;
    public MainWindow()
    {
        InitializeComponent();MainWindowGeometry.ApplyDefault(this);
        Title=ApplicationIdentity.Name;
        L.Bind(SidebarSizer,Microsoft.UI.Xaml.Automation.AutomationProperties.NameProperty,"main.sidebarWidth");L.Bind(DetailsSizer,Microsoft.UI.Xaml.Automation.AutomationProperties.NameProperty,"main.detailsWidth");
        services=new(Environment.GetEnvironmentVariable("CAP7CE_PHASEF_ROOT")??FindRoot());
        active=new BrowseSession(services);
        workspace=new(services,()=>active,results,toolbar);
        services.CatalogChanged+=roots=>DispatcherQueue.TryEnqueue(()=>{if(!closed){
            if(active.UsesCatalogResults&&Models.CatalogRefreshRules.AffectsChange(active.PathValue,roots))active.Invalidate();
            QueueCatalogRefresh();
            if(active is not null&&Models.CatalogRefreshRules.AffectsChange(active.PathValue,roots))filterAvailability?.Update(active,true);
        }});
        services.BackgroundError+=text=>DispatcherQueue.TryEnqueue(()=>{if(!closed)Notice(text);});
        services.MaintenanceRequested+=OpenMaintenance;
        filterAvailability=new(services,state=>DispatcherQueue.TryEnqueue(()=>{if(!closed&&filterAvailability?.IsCurrent(state)==true)filters.SetAvailability(state);}));
        commands=new(services,()=>Root.XamlRoot,Notice,WinRT.Interop.WindowNative.GetWindowHandle(this));details=new(services,commands,Notice);
        keywordNotice=new(services.AutoKeywords,notifications,details.SetAutoKeywordBusy);
        indexNotice=new(services,notifications);
        metadataNotice=new(services.Metadata,notifications);
        metadataFilters=new(services,()=>active,()=>Root.XamlRoot,Notice);filters.MetadataUnavailable+=metadataFilters.Request;
        previewLink=new(item=>item.FullPath,item=>!item.Entry.IsDirectory,results.SelectSingle,item=>preview?.FollowSelection(item),()=>preview?.Close());
        active.NavigationStarting+=preserve=>previewLink.NavigationStarting(active,preserve);active.Changed+=Bind;
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
        void SelectView(Models.WorkspaceViewMode mode)=>commands.Run(()=>workspace.UpdateAsync(value=>value with{
            View=mode==Models.WorkspaceViewMode.List?"list":"grid",
            SquareTiles=mode==Models.WorkspaceViewMode.List?value.SquareTiles:mode==Models.WorkspaceViewMode.Square}));
        services.Shortcuts=new(this,Surface,results,services.Preferences,commands,new(){
            ["focusMainSearch"]=()=>{WindowActivation.Show(this);toolbar.FocusSearch();},["focusSearch"]=toolbar.FocusSearch,["focusPath"]=toolbar.FocusPath,
            ["restoreDefaultWindow"]=()=>{WindowActivation.Show(this);MainWindowGeometry.RestoreDefault(this);},["openSettings"]=OpenSettings,
            ["openFolder"]=()=>ChooseFolder(false),["refresh"]=Refresh,
            ["back"]=()=>{if(active is not null)commands.Run(active.BackAsync);},["forward"]=()=>{if(active is not null)commands.Run(active.ForwardAsync);},
            ["up"]=()=>{if(active is not null)commands.Run(active.UpAsync);},["cycleDirectory"]=CycleDirectory,
            ["toggleWindowMode"]=()=>commands.Run(()=>services.Preferences.UpdateAsync(value=>value with{EdgeCollapseEnabled=!value.EdgeCollapseEnabled})),
            ["togglePin"]=()=>{if(!services.Preferences.Current.EdgeCollapseEnabled)SetPinned(!services.Preferences.Current.AlwaysOnTop);},
            ["toggleFilters"]=()=>commands.Run(()=>layout.ToggleAsync(true)),["toggleDetails"]=()=>commands.Run(()=>layout.ToggleAsync(false)),
            ["viewSquare"]=()=>SelectView(Models.WorkspaceViewMode.Square),["viewGallery"]=()=>SelectView(Models.WorkspaceViewMode.OriginalRatio),["viewList"]=()=>SelectView(Models.WorkspaceViewMode.List),
            ["metadata"]=()=>OpenMaintenance(null)
        },error=>Notice(FailureText.From(error)));
        toolbar.ViewSelected+=SelectView;
        toolbar.SizeChangedByUser+=workspace.PreviewSize;
        toolbar.SizeCommitted+=(size,scope)=>commands.Run(()=>workspace.UpdateAsync(value=>value with{TileSize=size},capturedScope:scope));
        toolbar.OptionsChanged+=update=>commands.Run(()=>workspace.UpdateAsync(update,true));
        filters.FilterChanged+=filter=>{if(active is null)return;active.Filter=filter;Refresh();};
        commands.NavigateRequested+=path=>{if(active is not null){active.Query="";commands.Run(()=>active.NavigateAsync(path));}};
        commands.PreviewRequested+=ShowPreview;
        commands.AutoKeywordsRequested+=items=>commands.Run(()=>services.AutoKeywords.StartAsync(items));
        services.AutoKeywords.Saved+=item=>details.RefreshKeywords(item);
        commands.CanEditKeywords=()=>DetailsBorder.Visibility==Visibility.Visible;commands.EditKeywordsRequested+=details.EditKeywords;
        commands.BeforeMutation+=()=>{preview?.Close();details.Stop();results.Suspend(true);};
        commands.ItemsDeleted+=active.RemoveDeleted;commands.ItemsRenamed+=()=>{results.ClearSelection();Refresh();};
        commands.AfterMutation+=()=>{results.Suspend(minimized);if(!minimized&&DetailsBorder.Visibility==Visibility.Visible)details.Select(results.Selection);};
        WorkspacePointerInput.PreserveSelection(DetailsBorder);WorkspacePointerInput.PreserveSelection(NoticeHost);
        pointerInput=new(Surface,results.ClearSelection,forward=>{if(active is {} session)commands.Run(()=>forward?session.ForwardAsync():session.BackAsync());});
        Surface.KeyDown+=KeyDown;
        tray=new(this,services,OpenSettings,Notice);
        edgeCollapse=new(this,Root,()=>preview is not null||settings is not null||ResultDrag.IsActive,Notice);
        commandInput=new(toolbar,notifications,new Commands.QuickCommandActions(services,this,()=>active,workspace,OpenSettings,SetPinnedAsync,()=>!layout.HorizontalGrid,tray.Exit));
        ResultDrag.Changed+=edgeCollapse.Wake;
        services.Notifications.Invoked+=NotificationInvoked;
        services.TaskNotices.IsObserved=kind=>!closed&&(!edgeCollapse.IsCollapsed&&NativeCaptionFeedback.IsActive(WinRT.Interop.WindowNative.GetWindowHandle(this))||(kind!="ai"&&settings?.IsViewingMaintenance==true));
        services.Preferences.Changed+=ApplyPreferences;
        AppWindow.Changed+=(_,_)=>{
            var next=AppWindow.Presenter is Microsoft.UI.Windowing.OverlappedPresenter p&&p.State==Microsoft.UI.Windowing.OverlappedPresenterState.Minimized;
            if(minimized==next)return;minimized=next;results.Suspend(next);if(next)details.Stop();else {details.Select(results.Selection);QueueCatalogRefresh();}
        };
        Closed+=OnClosed;
    }
    public bool ShowMainOnStartup=>services.Preferences.Current.ShowMainOnStartup;
    public bool TrayRegistrationFailed=>tray.RegistrationFailed;
    public async Task LoadStartupAsync()
    {
        try{await services.Preferences.LoadAsync();ApplyPreferences();}catch(Exception error){Notice(UiMessage.Key("ui.notice.preferencesFailed",new Dictionary<string,object?>{{"error",FailureText.From(error)}}));}
        tray.Initialize();
    }
    public async Task StartServicesAsync()
    {
        try{services.Notifications.Configure(services.Preferences.Current.Notifications);}catch(Exception error){Notice(UiMessage.Key("ui.notice.notificationsFailed",new Dictionary<string,object?>{{"error",FailureText.From(error)}}));}
        try{services.Shortcuts?.Apply();}catch(Exception error){Notice(FailureText.From(error));}
        AssetTile.Visuals=services.Visuals;OpenLocation("");
        try{await services.Favorites.ExecuteAsync();}catch(Exception error){Notice(UiMessage.Key("ui.notice.favoritesFailed",new Dictionary<string,object?>{{"error",FailureText.From(error)}}));}
        // Core readiness updates capabilities; it must not replace user navigation
        // or cancel directory reads started while the connection was pending.
        try{await services.ConnectAsync();if(!closed&&active is not null)filterAvailability.Update(active,true);}catch(Exception error){Notice(FailureText.From(error));}
    }
    private void Bind()
    {
        if(active is null||closed)return;
        previewLink.ContextChanged(active);
        workspace.Apply();
        sidebar.SetActiveEntry(active.EntryPath,active.PreferenceScope==Models.WorkspacePreferenceScope.Favorites);toolbar.Bind(active);filters.Restore(active.Filter);filterAvailability.Update(active);
        var preserveSelection=active.PreserveSelection;
        results.Bind(active.Items,active.PathValue.Length==0&&active.Query.Trim().Length==0&&active.Filter.Count==0&&!active.Random,active.ForegroundBusy,active.Error,active.Filter.Count>0||active.Query.Trim().Length>0,preserveSelection);
        details.SetContext(active.PathValue,active.ForegroundBusy?null:active.Items.TotalCount??(!active.Items.HasMoreItems?(long?)active.Items.Count:null),active.Filter.Count>0||active.Query.Trim().Length>0,active.Filter.Count,active.Items.Count,active.ForegroundBusy);
        notifications.SetBusy(active.ForegroundBusy);if(active.Error is {} error&&active.Items.Count>0)Notice(error);
        if(!active.Busy)QueueCatalogRefresh();
    }
    private void Refresh(){if(active is not null)commands.Run(()=>active.NavigateAsync(active.PathValue,false));}
    private bool CanCatalogRefresh()=>!closed&&active is {UsesCatalogResults:true} session&&Models.CatalogRefreshRules.CanRefresh(session.Invalidated,session.Busy,results.Selection.Count,preview is not null,minimized);
    private void QueueCatalogRefresh()
    {
        if(closed||catalogRefreshQueued)return;catalogRefreshQueued=true;
        DispatcherQueue.TryEnqueue(()=>{catalogRefreshQueued=false;if(CanCatalogRefresh()&&active is {} session)commands.Run(()=>session.NavigateAsync(session.PathValue,false,true));});
    }
    private void OpenLocation(string path)
    {
        // Navigation entry always returns to the requested root with fresh query state.
        var favorite=path.Length>0&&services.Favorites.Items.Any(item=>string.Equals(item.Path.TrimEnd('\\','/'),path.TrimEnd('\\','/'),StringComparison.OrdinalIgnoreCase));
        if(!closed)commands.Run(()=>active.OpenLocationAsync(path,favorite));
    }
    private async void ChooseFolder(bool favorite)
    {
        try
        {
            var picker=new FolderPicker();picker.FileTypeFilter.Add("*");WinRT.Interop.InitializeWithWindow.Initialize(picker,WinRT.Interop.WindowNative.GetWindowHandle(this));
            if(await picker.PickSingleFolderAsync() is not { } folder)return;FileAccessGuard.RejectLinks(folder.Path);
            if(favorite)await services.Favorites.ExecuteAsync("add",path:folder.Path);else OpenLocation(folder.Path);
        }
        catch(Exception error){Notice(FailureText.From(error));}
    }
    private void ShowPreview(Models.AssetItem item)
    {
        if(preview is null){preview=new(services,this);preview.CurrentChanged+=previewLink.PreviewChanged;preview.Closed+=(_,_)=>{previewLink.Detach();preview=null;QueueCatalogRefresh();edgeCollapse.Wake();};}
        IReadOnlyList<Models.AssetItem> source=active?.Items??[item];
        if(active is not null)previewLink.Open(active,source,item);
        preview.Show(item,source);
    }
    private void OpenSettings()
    {
        try{if(settings is null){settings=new(services);settings.Closed+=(_,_)=>{settings=null;edgeCollapse.Wake();};}WindowActivation.Show(settings);}
        catch(Exception error){NativeDiagnostics.VisualFailure(error);Notice(UiMessage.Key("ui.notice.settingsFailed"));}
    }
    private void OpenMaintenance(string? path)
    {
        OpenSettings();settings?.ShowMaintenance();
    }
    private void ApplyPreferences()=>DispatcherQueue.TryEnqueue(()=>{
        if(closed)return;var prefs=services.Preferences.Current;
        // LanguageBinding already updated text; do not reapply layout or window actions.
        if(appliedPreferences is {} languagePrevious&&(languagePrevious with{Language=prefs.Language})==prefs){appliedPreferences=prefs;return;}
        if(appliedPreferences is {} shortcutPrevious&&(shortcutPrevious with{ShortcutBindings=prefs.ShortcutBindings})==prefs){appliedPreferences=prefs;return;}
        var pinOnly=appliedPreferences is { } previous&&(previous with{AlwaysOnTop=prefs.AlwaysOnTop,PreviewAlwaysOnTop=prefs.PreviewAlwaysOnTop})==prefs;
        var workspaceOnly=appliedPreferences is {} old&&(old with{ComputerWorkspace=prefs.ComputerWorkspace,FavoriteWorkspace=prefs.FavoriteWorkspace})==prefs;
        var edgeOnly=appliedPreferences is {} edgeOld&&(edgeOld with{EdgeCollapseEnabled=prefs.EdgeCollapseEnabled})==prefs;
        if(!pinOnly&&!workspaceOnly&&!edgeOnly){ThemeService.Apply(this,Surface,prefs);layout.ApplyPreferences();}
        workspace.Apply();
        WindowTitleBar.ConfigurePin(this,prefs.AlwaysOnTop,SetPinned,visible:!prefs.EdgeCollapseEnabled);edgeCollapse.Configure(prefs.EdgeCollapseEnabled,prefs.AlwaysOnTop);appliedPreferences=prefs;
    });
    private void SetPinned(bool value)=>commands.Run(()=>SetPinnedAsync(value));
    private async Task SetPinnedAsync(bool value){
        try{await services.Preferences.UpdateAsync(prefs=>prefs with{AlwaysOnTop=value});}
        catch{ApplyPreferences();throw;}
    }
    private void NotificationInvoked()=>DispatcherQueue.TryEnqueue(()=>{if(!closed)WindowActivation.Show(this);});
    private void CycleDirectory(){var paths=new[]{""}.Concat(services.Favorites.Items.Select(f=>f.Path)).ToArray();OpenLocation(paths[(Array.IndexOf(paths,active?.EntryPath??"")+1)%paths.Length]);}
    private void Notice(string text)=>Notice(UiMessage.Literal(text));
    private void Notice(UiMessage text){if(!closed)notifications.ShowMessage(text);}
    private void KeyDown(object sender,KeyRoutedEventArgs e)
    {
        if(e.OriginalSource is TextBox||e.OriginalSource is AutoSuggestBox)return;
        if(e.Key==VirtualKey.Escape){e.Handled=true;if(!sidebar.CancelOrder())results.ClearSelection();return;}
    }
    private async void OnClosed(object sender,WindowEventArgs e)
    {
        closed=true;tray.Dispose();commandInput.Dispose();services.Notifications.Invoked-=NotificationInvoked;ResultDrag.Changed-=edgeCollapse.Wake;edgeCollapse.Dispose();pointerInput.Dispose();keywordNotice.Dispose();indexNotice.Dispose();metadataNotice.Dispose();metadataFilters.Dispose();notifications.Dispose();filterAvailability.Dispose();services.Preferences.Changed-=ApplyPreferences;layout.Dispose();details.Stop();preview?.Close();settings?.Close();AssetTile.Visuals=null;
        active.Changed-=Bind;active.Dispose();
        try{await services.DisposeAsync();}catch{}
    }
    private static string FindRoot()
    {
        for(var directory=new DirectoryInfo(AppContext.BaseDirectory);directory is not null;directory=directory.Parent)
            if(File.Exists(Path.Combine(directory.FullName,"cap7ce-native.json"))||File.Exists(Path.Combine(directory.FullName,"package.json"))&&Directory.Exists(Path.Combine(directory.FullName,"core")))return directory.FullName;
        return AppContext.BaseDirectory;
    }
}
