using Cap7CE.WinUI.Controls;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Services;

internal static class ResultContextMenu
{
    internal static MenuFlyout Build(FileCommands commands,FavoriteService favorites,IReadOnlyList<AssetItem> items,bool home)
    {
        var menu=ThemeService.Menu();if(items.Count==0)return menu;
        var first=items[0];
        var favorite=favorites.Items.FirstOrDefault(entry=>entry.Path.TrimEnd('\\','/').Equals(first.FullPath.TrimEnd('\\','/'),StringComparison.OrdinalIgnoreCase));
        foreach(var action in ResultMenuRules.Create(items.Count,home,first.Entry.IsDirectory)) {
            if(action.NewGroup)menu.Items.Add(new MenuFlyoutSeparator());
            MenuFlyoutItem item=action.Id switch {
                "preview"=>L.MenuItem("menu.preview",()=>commands.Run(()=>{commands.Preview(first);return Task.CompletedTask;}),"\uE8A7"),
                "open"=>L.MenuItem("menu.open",()=>commands.Run(()=>{commands.Open(first);return Task.CompletedTask;}),"\uE8A5"),
                "reveal"=>L.MenuItem("menu.reveal",()=>commands.Run(()=>{commands.Reveal(first);return Task.CompletedTask;}),"\uE838"),
                "copyPaths"=>L.MenuItem(items.Count>1?"menu.copyPaths":"menu.copyPath",()=>commands.Run(()=>{FileCommands.CopyPaths(items);return Task.CompletedTask;}),"\uE8C8",()=>new Dictionary<string,object?>{{"count",items.Count}}),
                "delete"=>L.MenuItem("menu.delete",()=>commands.Run(()=>commands.DeleteAsync(items)),"\uE74D"),
                "favorite"=>L.MenuItem(favorite is null?"menu.addFavorite":"menu.removeFavorite",()=>commands.Run(()=>favorite is null
                    ?favorites.ExecuteAsync("add",path:first.FullPath):favorites.ExecuteAsync("remove",id:favorite.Id)),"\uE734"),
                "editKeywords"=>L.MenuItem("menu.editKeywords",()=>commands.EditKeywords(items),"\uE70F"),
                "autoKeywords"=>L.MenuItem("menu.autoKeywords",()=>commands.Run(()=>{commands.AutoKeywords(items);return Task.CompletedTask;})),
                _=>L.MenuItem("menu.metadata",()=>commands.Run(()=>commands.StartMetadataAsync(first)),"\uE895")
            };
            if(action.Id=="delete")item.IsEnabled=items.All(entry=>entry.Entry.FileReference is not null);
            if(action.Id=="autoKeywords"){
                item.Icon=AiActionIcon.Attach(item);
                item.IsEnabled=items.Count>1||items.Any(entry=>entry.Entry.IsDirectory||FormatRegistry.Find(entry.Entry.Extension)?.CanAIIndex==true);
            }
            if(action.Id=="editKeywords") {
                item.IsEnabled=items.Any(entry=>!entry.Entry.IsDirectory)&&commands.CanEditKeywords();
                if(!item.IsEnabled)L.Bind(item,ToolTipService.ToolTipProperty,"menu.editKeywordsUnavailable");
            }
            menu.Items.Add(item);
        }
        return menu;
    }
    internal static MenuFlyoutItem Unavailable(string label,string reason,string glyph)
    {var item=L.MenuItem(label,()=>{},glyph);item.IsEnabled=false;L.Bind(item,ToolTipService.ToolTipProperty,reason);return item;}
}
