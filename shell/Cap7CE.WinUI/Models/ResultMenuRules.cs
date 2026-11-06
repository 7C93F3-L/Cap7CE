namespace Cap7CE.WinUI.Models;

internal readonly record struct ResultMenuAction(string Id,bool NewGroup=false);
internal static class ResultMenuRules
{
    internal static string ShortcutText(string menuId,ShellPreferences preferences)
    {
        var id=menuId switch {
            "preview"=>"previewSelected","open"=>"openSelected","reveal"=>"revealFile","copyPaths"=>"copyPaths","copyFiles"=>"copyFiles","cutFiles"=>"cutFiles",
            "rename"=>"renameSelected","delete"=>"deleteSelected","editKeywords"=>"editKeywords","autoKeywords"=>"aiKeywords","favorite"=>"toggleFavorite",_=>null
        };
        var action=ShortcutCatalog.All.FirstOrDefault(action=>action.Id==id);
        if(action is null)return "";
        var binding=ShortcutCatalog.Binding(preferences,action);
        return ShortcutCatalog.Validate(action,binding,preferences) is null&&ShortcutGesture.TryParse(binding.Gesture,out var key)?key.ToString():"";
    }
    // Order and grouping follow CatalogHomeContextMenu/ComputerSearchResultContextMenu.
    internal static IReadOnlyList<ResultMenuAction> Create(int count,bool home,bool directory)
    {
        if(count==0)return [];
        List<ResultMenuAction> actions=[new("preview"),new("open"),new("reveal"),new("copyPaths"),new("copyFiles",true)];
        if(!home)actions.Add(new("cutFiles"));
        if(!home){actions.Add(new("rename"));actions.Add(new("delete"));}
        if(count==1&&directory)actions.Add(new("favorite"));
        if(!home){actions.Add(new("editKeywords",true));actions.Add(new("autoKeywords"));}
        else if(count==1)actions.Add(new("autoKeywords",true));
        if(count==1&&directory)actions.Add(new("metadata"));
        return actions;
    }
}
