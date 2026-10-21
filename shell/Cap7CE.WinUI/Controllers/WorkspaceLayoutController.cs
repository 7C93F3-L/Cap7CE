using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Services;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controllers;

internal sealed class WorkspaceLayoutController : IDisposable
{
    private readonly Window window;
    private readonly FrameworkElement surface;
    private readonly Grid root;
    private readonly ColumnDefinition sidebarColumn, detailsColumn;
    private readonly ContentControl sidebarHost, filterHost;
    private readonly FrameworkElement mainHost, detailsHost;
    private readonly SidebarView sidebar;
    private readonly PaneResizer sidebarSizer;
    private readonly PreferenceStore preferences;
    private readonly Action<string> notice;
    private readonly WorkspaceLayoutPolicy policy = new();
    private WorkspaceLayoutSnapshot? snapshot;
    private double sidebarWidth, detailsWidth;
    private bool disposed;
    private Task? pendingRestore;
    public event Action<bool>? DetailsVisibilityChanged;
    public event Action<bool>? HorizontalGridChanged;
    public bool HorizontalGrid => snapshot?.HorizontalGrid == true;

    public WorkspaceLayoutController(Window window, FrameworkElement surface, Grid root, ColumnDefinition sidebarColumn,
        ColumnDefinition detailsColumn, ContentControl sidebarHost, ContentControl filterHost, FrameworkElement mainHost, FrameworkElement detailsHost,
        SidebarView sidebar, PaneResizer sidebarSizer, PaneResizer detailsSizer, PreferenceStore preferences, Action<string> notice)
    {
        this.window = window; this.surface = surface; this.root = root; this.sidebarColumn = sidebarColumn;
        this.detailsColumn = detailsColumn; this.sidebarHost = sidebarHost; this.filterHost = filterHost;
        this.mainHost = mainHost; this.detailsHost = detailsHost; this.sidebar = sidebar; this.sidebarSizer = sidebarSizer;
        this.preferences = preferences; this.notice = notice;
        sidebarSizer.ResizeRequested += delta => Resize(true, delta);
        detailsSizer.ResizeRequested += delta => Resize(false, -delta);
        sidebarSizer.ResizeCompleted += () => SaveWidth(true);
        detailsSizer.ResizeCompleted += () => SaveWidth(false);
        sidebarSizer.ResetRequested += () => Reset(true);
        detailsSizer.ResetRequested += () => Reset(false);
        sidebarSizer.KeyResizeRequested += delta => { Resize(true, delta); SaveWidth(true); };
        detailsSizer.KeyResizeRequested += delta => { Resize(false, -delta); SaveWidth(false); };
        root.SizeChanged += OnSizeChanged;
        ApplyPreferences();
    }

    public void ApplyPreferences()
    {
        sidebarWidth = WorkspaceLayoutPolicy.PreferredSidebar(preferences.Current.SidebarWidth);
        detailsWidth = WorkspaceLayoutPolicy.PreferredDetails(preferences.Current.DetailsWidth);
        Refresh();
    }

    private void OnSizeChanged(object sender, SizeChangedEventArgs e) => Refresh();
    private double ViewportWidth => surface.XamlRoot?.Size.Width ?? surface.ActualWidth;
    private double ViewportHeight => surface.XamlRoot?.Size.Height ?? surface.ActualHeight;
    public void Refresh()
    {
        if (disposed || ViewportWidth <= 0 || ViewportHeight <= 0) return;
        var prefs = preferences.Current;
        var next = policy.Update(ViewportWidth, ViewportHeight, sidebarWidth, detailsWidth, prefs.ShowFilters, prefs.ShowDetails);
        var previous = snapshot; snapshot = next;
        sidebarHost.Visibility = sidebarSizer.Visibility = next.SidebarVisible ? Visibility.Visible : Visibility.Collapsed;
        sidebarColumn.Width = new(next.SidebarVisible ? next.SidebarWidth : 0);
        filterHost.Visibility = next.FiltersVisible ? Visibility.Visible : Visibility.Collapsed;
        detailsHost.Visibility = next.DetailsVisible ? Visibility.Visible : Visibility.Collapsed;
        detailsColumn.Width = new(next.DetailsVisible ? next.DetailsWidth + 8 : 0);
        root.ColumnSpacing = root.RowSpacing = 0;
        var leftGap = next.SidebarVisible ? 8 : 0;
        filterHost.Margin = new(leftGap,0,0,0);
        mainHost.Margin = new(leftGap,next.FiltersVisible ? 6 : 0,0,0);
        detailsHost.Margin = new(8,next.FiltersVisible ? 6 : 0,0,0);
        root.Padding = new(next.SidebarVisible && !next.SidebarCompact ? 8 : 0, 0, 8, 8);
        sidebar.ApplyLayout(next.SidebarCompact, next.BrandVisible, next.FiltersVisible, next.DetailsVisible);
        if (previous?.DetailsVisible != next.DetailsVisible) DetailsVisibilityChanged?.Invoke(next.DetailsVisible);
        if (previous?.HorizontalGrid != next.HorizontalGrid) HorizontalGridChanged?.Invoke(next.HorizontalGrid);
    }

    private void Resize(bool left, double delta)
    {
        if (disposed || snapshot is not { } current) return;
        if (left) sidebarWidth = WorkspaceLayoutPolicy.ClampSidebar(current.SidebarWidth + delta, ViewportWidth);
        else detailsWidth = WorkspaceLayoutPolicy.ClampDetails(current.DetailsWidth + delta, ViewportWidth, current.SidebarWidth);
        Refresh();
    }

    private void Reset(bool left)
    {
        if (left) sidebarWidth = WorkspaceLayoutPolicy.DefaultSidebarWidth;
        else detailsWidth = WorkspaceLayoutPolicy.DefaultDetailsWidth;
        Refresh(); SaveWidth(left);
    }

    private async void SaveWidth(bool left)
    {
        if (disposed) return;
        try { await preferences.SaveAsync(left ? preferences.Current with { SidebarWidth = sidebarWidth }
            : preferences.Current with { DetailsWidth = detailsWidth }); }
        catch (Exception error) { notice(error.Message); }
    }

    public async Task ToggleAsync(bool filters)
    {
        if (disposed) return;
        var visible = filters ? snapshot?.FiltersVisible == true : snapshot?.DetailsVisible == true;
        if (visible) policy.ClearForce(filters);
        else
        {
            if (policy.RequiresRestore) await (pendingRestore ??= RestoreAsync());
            if (disposed) return;
            policy.ForceOpen(filters);
        }
        var prefs = preferences.Current;
        await preferences.SaveAsync(filters ? prefs with { ShowFilters = !visible } : prefs with { ShowDetails = !visible });
        Refresh();
    }

    private async Task RestoreAsync()
    {
        await Task.Yield();
        try
        {
            if (disposed) return;
            MainWindowGeometry.RestoreDefault(window);
            await LayoutTurnAsync(); await LayoutTurnAsync();
            if (!disposed) { root.UpdateLayout(); Refresh(); }
        }
        finally { pendingRestore = null; }
    }

    private Task LayoutTurnAsync()
    {
        var completion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        if (!root.DispatcherQueue.TryEnqueue(DispatcherQueuePriority.Low, () => completion.TrySetResult())) completion.TrySetResult();
        return completion.Task;
    }

    public void Dispose() { disposed = true; root.SizeChanged -= OnSizeChanged; }
}
