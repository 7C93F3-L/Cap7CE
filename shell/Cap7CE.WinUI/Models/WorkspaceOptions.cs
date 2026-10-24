namespace Cap7CE.WinUI.Models;

internal enum WorkspacePreferenceScope { Computer,Favorites }
internal sealed record WorkspaceLocation(string Path,WorkspacePreferenceScope Scope);

public sealed record WorkspaceOptions
{
    public string View {get;init;}="grid";
    public bool SquareTiles {get;init;}=true;
    public double TileSize {get;init;}=160;
    public bool Recursive {get;init;}
    public bool ShowHidden {get;init;}
    public string Sort {get;init;}="name-ascending";
    public static WorkspaceOptions ComputerDefault=>new();
    public static WorkspaceOptions FavoritesDefault=>new(){SquareTiles=false,Recursive=true,Sort="modified-descending"};
    internal static bool SearchByDefault(WorkspacePreferenceScope scope)=>scope==WorkspacePreferenceScope.Favorites;
    internal static WorkspaceOptions Read(ShellPreferences prefs,WorkspacePreferenceScope scope)
        =>Normalize(scope==WorkspacePreferenceScope.Favorites?prefs.FavoriteWorkspace:prefs.ComputerWorkspace,
            scope==WorkspacePreferenceScope.Favorites?FavoritesDefault:ComputerDefault);
    internal static ShellPreferences Write(ShellPreferences prefs,WorkspacePreferenceScope scope,WorkspaceOptions value)
        =>scope==WorkspacePreferenceScope.Favorites?prefs with{FavoriteWorkspace=Normalize(value,FavoritesDefault)}:prefs with{ComputerWorkspace=Normalize(value,ComputerDefault)};
    internal static ShellPreferences Project(ShellPreferences prefs,WorkspacePreferenceScope scope)
    {
        var value=Read(prefs,scope);
        return prefs with{View=value.View,SquareTiles=value.SquareTiles,TileSize=value.TileSize,Recursive=value.Recursive,ShowHidden=value.ShowHidden,Sort=value.Sort};
    }
    internal static WorkspaceOptions Normalize(WorkspaceOptions? value,WorkspaceOptions fallback)
    {
        if(value is null)return fallback;
        return value with {
            View=value.View is "grid" or "list"?value.View:fallback.View,
            TileSize=double.IsFinite(value.TileSize)&&value.TileSize is >=96 and <=280?value.TileSize:fallback.TileSize,
            Sort=value.Sort is "name-ascending" or "name-descending" or "modified-ascending" or "modified-descending"?value.Sort:fallback.Sort};
    }
}
