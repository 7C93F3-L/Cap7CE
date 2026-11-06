using Cap7CE.WinUI.Controls;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Services;

namespace Cap7CE.WinUI.Controllers;

// Owns scoped toolbar persistence/presentation, never directory enumeration or navigation history.
internal sealed class WorkspacePreferencesController(ShellServices services,Func<BrowseSession?> active,ResultsView results,WorkspaceToolbar toolbar)
{
    private (string View,bool Square,double Size)? presented;
    public ShellPreferences Effective {
        get{var session=active();var value=WorkspaceOptions.Project(services.Preferences.Current,session?.PreferenceScope??WorkspacePreferenceScope.Computer);
            return session?.PreferenceScope==WorkspacePreferenceScope.Computer?value with{Recursive=session.Recursive}:value;}
    }
    public void Apply()
    {
        var value=Effective;var key=(value.View,value.SquareTiles,value.TileSize);
        if(presented==key)return;presented=key;
        AssetTile.Configure(value);results.Preferences(value);toolbar.ApplyPreferences(value);
    }
    public void PreviewSize(double value)
    {AssetTile.Configure(Effective with{TileSize=value});results.PreviewSize(value);}
    public async Task UpdateAsync(Func<WorkspaceOptions,WorkspaceOptions> update,bool reload=false,WorkspacePreferenceScope? capturedScope=null)
    {
        var session=active();if(session is null)return;var scope=capturedScope??session.PreferenceScope;
        var path=session.PathValue;var revision=session.AddressRevision;
        if(scope==WorkspacePreferenceScope.Computer&&session.PreferenceScope==scope)
        {
            var stored=WorkspaceOptions.Read(services.Preferences.Current,scope);
            var next=update(stored with{Recursive=session.Recursive});session.Recursive=next.Recursive;
            // A temporary-only toggle requires no preference write and takes effect before another click.
            if((next with{Recursive=false})==stored){if(reload)await session.NavigateAsync(path,false);return;}
        }
        // Appearance and Favorites options still use the store's serialized updates.
        await services.Preferences.UpdateAsync(p=>WorkspaceOptions.Write(p,scope,update(WorkspaceOptions.Read(p,scope))));
        if(!ReferenceEquals(active(),session)||session.PreferenceScope!=scope||session.PathValue!=path||session.AddressRevision!=revision)return;
        if(reload)await session.NavigateAsync(session.PathValue,false);
    }
}
