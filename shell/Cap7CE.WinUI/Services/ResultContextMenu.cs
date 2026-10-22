using Cap7CE.WinUI.Controls;
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
                "preview"=>Ui.MenuItem("预览",()=>commands.Run(()=>{commands.Preview(first);return Task.CompletedTask;}),"\uE8A7"),
                "open"=>Ui.MenuItem("打开",()=>commands.Run(()=>{commands.Open(first);return Task.CompletedTask;}),"\uE8A5"),
                "reveal"=>Ui.MenuItem("打开路径",()=>commands.Run(()=>{commands.Reveal(first);return Task.CompletedTask;}),"\uE838"),
                "copyPaths"=>Ui.MenuItem(items.Count>1?$"复制选中的 {items.Count} 条路径":"复制路径",()=>commands.Run(()=>{FileCommands.CopyPaths(items);return Task.CompletedTask;}),"\uE8C8"),
                "delete"=>Ui.MenuItem("删除",()=>commands.Run(()=>commands.DeleteAsync(items)),"\uE74D"),
                "favorite"=>Ui.MenuItem(favorite is null?"添加收藏":"移除收藏",()=>commands.Run(()=>favorite is null
                    ?favorites.ExecuteAsync("add",path:first.FullPath):favorites.ExecuteAsync("remove",id:favorite.Id)),"\uE734"),
                "editKeywords"=>Ui.MenuItem("编辑关键词",()=>commands.EditKeywords(first),"\uE70F"),
                "autoKeywords"=>Unavailable("自动添加关键词","自动关键词任务尚未迁入WinUI壳","\uE945"),
                _=>Ui.MenuItem("获取/刷新元数据",()=>commands.Run(()=>{commands.ShowMetadata(first);return Task.CompletedTask;}),"\uE895")
            };
            if(action.Id=="delete")item.IsEnabled=items.All(entry=>entry.Entry.FileReference is not null);
            if(action.Id=="editKeywords") {
                item.IsEnabled=items.Count==1&&!first.Entry.IsDirectory&&first.Entry.FileReference is not null&&commands.CanEditKeywords();
                if(!item.IsEnabled)ToolTipService.SetToolTip(item,items.Count>1?"批量关键词编辑尚未迁入WinUI壳":"请选中单个文件并展开右侧详细信息栏");
            }
            menu.Items.Add(item);
        }
        return menu;
    }
    internal static MenuFlyoutItem Unavailable(string label,string reason,string glyph)
    {var item=Ui.MenuItem(label,()=>{},glyph);item.IsEnabled=false;ToolTipService.SetToolTip(item,reason);return item;}
}
