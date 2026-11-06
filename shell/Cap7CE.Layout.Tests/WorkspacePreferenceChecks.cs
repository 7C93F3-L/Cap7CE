using System.Text.Json;
using Cap7CE.WinUI.Models;

internal static class WorkspacePreferenceChecks
{
    public static void Run()
    {
        void Require(bool value,string label){if(!value)throw new Exception(label);}
        var computer=WorkspacePreferenceScope.Computer;var favorites=WorkspacePreferenceScope.Favorites;
        var json=new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var original=JsonSerializer.Deserialize<ShellPreferences>("{\"theme\":\"dark\",\"fontSize\":15,\"view\":\"list\",\"recursive\":true,\"showHidden\":true,\"sort\":\"modified-descending\"}",json)!;
        var pc=WorkspaceOptions.Read(original,computer);var fav=WorkspaceOptions.Read(original,favorites);
        Require(pc==WorkspaceOptions.ComputerDefault,"missing split profiles use Computer defaults rather than the legacy global view");
        Require(fav==WorkspaceOptions.FavoritesDefault,"all favorites share their own defaults");
        Require(pc.SquareTiles&&!pc.Recursive&&pc.Sort=="name-ascending"&&!pc.ShowHidden,"Computer requested defaults");
        Require(!fav.SquareTiles&&fav.Recursive&&fav.Sort=="modified-descending"&&!fav.ShowHidden,"Favorites requested defaults");
        Require(!WorkspaceOptions.SearchByDefault(computer)&&WorkspaceOptions.SearchByDefault(favorites),"entry resets breadcrumb/search according to scope, not previous editor state");
        var changed=WorkspaceOptions.Write(original,computer,pc with{View="list",TileSize=240,Sort="name-descending",ShowHidden=true,Recursive=true});
        changed=WorkspaceOptions.Write(changed,favorites,fav with{View="grid",SquareTiles=true,TileSize=128,Sort="modified-ascending",Recursive=false});
        Require(!changed.ComputerWorkspace!.Recursive,"Computer recursion is never written into preferences");
        var legacy=changed with{ComputerWorkspace=changed.ComputerWorkspace with{Recursive=true}};
        Require(!WorkspaceOptions.Read(legacy,computer).Recursive,"old persisted Computer recursion is ignored");
        var restored=JsonSerializer.Deserialize<ShellPreferences>(JsonSerializer.Serialize(changed,json),json)!;
        Require(WorkspaceOptions.Read(restored,computer)==WorkspaceOptions.Read(changed,computer),"Computer config round trip retains all toolbar fields");
        Require(WorkspaceOptions.Read(restored,favorites)==WorkspaceOptions.Read(changed,favorites),"shared favorite config round trip retains all toolbar fields");
        Require(restored.Theme=="dark"&&!JsonSerializer.Serialize(restored,json).Contains("fontSize",StringComparison.OrdinalIgnoreCase),"scoped writes preserve theme and do not revive retired font size");
        var shared=WorkspaceOptions.Write(restored,favorites,WorkspaceOptions.Read(restored,favorites) with{Sort="modified-descending"});
        Require(WorkspaceOptions.Read(shared,computer)==WorkspaceOptions.Read(restored,computer),"changing a favorite cannot overwrite Computer config");
        Require(WorkspaceOptions.Project(shared,favorites).TileSize==128&&WorkspaceOptions.Project(shared,computer).TileSize==240,"presentation follows entry scope");
        Require(new WorkspaceLocation("E:\\Content",computer)!=new WorkspaceLocation("E:\\Content",favorites),"history distinguishes identical paths entered from different scopes");
        var invalid=WorkspaceOptions.Normalize(new(){View="bad",TileSize=double.NaN,Sort="bad",ShowHidden=true},WorkspaceOptions.FavoritesDefault);
        Require(invalid.View=="grid"&&invalid.TileSize==160&&invalid.Sort=="modified-descending"&&invalid.ShowHidden,"invalid fields recover locally without discarding valid fields");
        Require(WorkspaceOptions.Normalize(null,fav)==fav,"null profile safely uses defaults");
        Require(!JsonSerializer.Serialize(pc,json).Contains("random",StringComparison.OrdinalIgnoreCase),"random mode is not a persisted toolbar setting");
        Console.WriteLine("Workspace preferences checks passed (two independent profiles, shared favorites, defaults, editor mode, history scope, validation and serialization).");
    }
}
