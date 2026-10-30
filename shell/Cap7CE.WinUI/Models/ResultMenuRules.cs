namespace Cap7CE.WinUI.Models;

internal readonly record struct ResultMenuAction(string Id,bool NewGroup=false);
internal static class ResultMenuRules
{
    // Order and grouping follow CatalogHomeContextMenu/ComputerSearchResultContextMenu.
    internal static IReadOnlyList<ResultMenuAction> Create(int count,bool home,bool directory)
    {
        if(count==0)return [];
        List<ResultMenuAction> actions=[new("preview"),new("open"),new("reveal"),new("copyPaths")];
        if(!home){actions.Add(new("rename"));actions.Add(new("delete"));}
        if(count==1&&directory)actions.Add(new("favorite"));
        if(!home){actions.Add(new("editKeywords",true));actions.Add(new("autoKeywords"));}
        else if(count==1)actions.Add(new("autoKeywords",true));
        if(count==1&&directory)actions.Add(new("metadata"));
        return actions;
    }
}
