namespace Cap7CE.WinUI.Models;

public sealed record ShellPreferences
{
    public bool Notifications {get;init;}
    public bool QuickActions {get;init;}
	public bool AlwaysOnTop { get; init; }

	public string Material { get; init; } = "mica";

	public string Theme { get; init; } = "system";

	public string Color1 { get; init; } = "#7894F8";

	public string Color2 { get; init; } = "#67BEC1";

	public double FontSize { get; init; } = 13.0;

	public double TileSize { get; init; } = 160.0;

	public bool ShowFilters { get; init; } = true;

	public bool ShowDetails { get; init; } = true;

	public bool ShowHidden { get; init; }

	public bool Recursive { get; init; }

	public bool SquareTiles { get; init; } = true;

	public string View { get; init; } = "grid";

	public double SidebarWidth { get; init; } = 156.0;

	public double DetailsWidth { get; init; } = 280.0;

	public string Sort { get; init; } = "name-ascending";
}
