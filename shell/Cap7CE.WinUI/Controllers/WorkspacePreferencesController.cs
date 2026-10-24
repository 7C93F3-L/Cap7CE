using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;

namespace Cap7CE.WinUI.Controllers;

// Owns scoped toolbar persistence/presentation, never directory enumeration or navigation history.
internal sealed class WorkspacePreferencesController(ShellServices services,Func<BrowseSession?> active,ResultsView results,WorkspaceToolbar toolbar)
{
    private (string View,bool Square,double Size,double Font)? presented;
    public ShellPreferences Effective=>WorkspaceOptions.Project(services.Preferences.Current,active()?.PreferenceScope??WorkspacePreferenceScope.Computer);
    public void Apply()
    {
        var value=Effective;var key=(value.View,value.SquareTiles,value.TileSize,value.FontSize);
        if(presented==key)return;presented=key;
        AssetTile.Configure(value);results.Preferences(value);toolbar.ApplyPreferences(value);
    }
    public void PreviewSize(double value)
    {AssetTile.Configure(Effective with{TileSize=value});results.PreviewSize(value);}
    public async Task UpdateAsync(Func<WorkspaceOptions,WorkspaceOptions> update,bool reload=false,WorkspacePreferenceScope? capturedScope=null)
    {
        var session=active();if(session is null)return;var scope=capturedScope??session.PreferenceScope;
        // Read/update inside the store's existing gate so concurrent scope saves do not overwrite each other.
        await services.Preferences.UpdateAsync(p=>WorkspaceOptions.Write(p,scope,update(WorkspaceOptions.Read(p,scope))));
        if(reload&&ReferenceEquals(active(),session)&&session.PreferenceScope==scope)
            await session.NavigateAsync(session.PathValue,false);
    }
}
