namespace Cap7CE.WinUI.Controllers;

internal sealed record WorkspaceLayoutSnapshot(double SidebarWidth, double DetailsWidth,
    bool SidebarVisible, bool SidebarCompact, bool BrandVisible, bool FiltersVisible, bool DetailsVisible, bool HorizontalGrid);

internal sealed class WorkspaceLayoutPolicy
{
    public const double DefaultSidebarWidth = 156, MinimumSidebarWidth = 40, MaximumSidebarWidth = 320;
    public const double DefaultDetailsWidth = 280, MinimumDetailsWidth = 220, MaximumDetailsWidth = 420;
    private double previousWidth, previousHeight;
    private bool detailsConstrained, filtersConstrained, forceFilters, forceDetails;
    public bool RequiresRestore => detailsConstrained || filtersConstrained;

    public WorkspaceLayoutSnapshot Update(double width, double height, double sidebar, double details, bool showFilters, bool showDetails)
    {
        if (height < previousHeight) forceFilters = false;
        if (width < previousWidth || height < previousHeight) forceDetails = false;
        detailsConstrained = width < (detailsConstrained ? 960 : 900);
        filtersConstrained = height < (filtersConstrained ? 560 : 520);
        previousWidth = width; previousHeight = height;
        var sidebarWidth = Math.Min(PreferredSidebar(sidebar), Math.Max(MinimumSidebarWidth, width - 260));
        return new(sidebarWidth, ClampDetails(details, width, sidebarWidth), height >= 360, sidebarWidth < 90, sidebarWidth > 95,
            showFilters && (!filtersConstrained || forceFilters), showDetails && ((!detailsConstrained && !filtersConstrained) || forceDetails), height < 360);
    }

    public void ForceOpen(bool filters)
    {
        if (filters) forceFilters = filtersConstrained;
        else forceDetails = detailsConstrained || filtersConstrained;
    }

    public void ClearForce(bool filters) { if (filters) forceFilters = false; else forceDetails = false; }
    public static double PreferredSidebar(double value) => Clamp(value, MinimumSidebarWidth, MaximumSidebarWidth, DefaultSidebarWidth);
    public static double PreferredDetails(double value) => Clamp(value, MinimumDetailsWidth, MaximumDetailsWidth, DefaultDetailsWidth);
    public static double ClampSidebar(double value, double width) => PreferredSidebar(Math.Min(value, Math.Max(MinimumSidebarWidth, width - 260)));
    public static double ClampDetails(double value, double width, double sidebar) => Math.Max(MinimumDetailsWidth,
        Math.Min(PreferredDetails(value), width - sidebar - 32 - 300));
    private static double Clamp(double value, double min, double max, double fallback) =>
        double.IsFinite(value) ? Math.Clamp(Math.Round(value, MidpointRounding.AwayFromZero), min, max) : fallback;
}
