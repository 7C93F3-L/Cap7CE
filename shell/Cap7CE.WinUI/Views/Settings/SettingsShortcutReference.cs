using Cap7CE.WinUI.Controls;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using System.Text.Json;

namespace Cap7CE.WinUI.Views;

internal static class SettingsShortcutReference
{
    public static UIElement Actions()
    {
        var column=Ui.Column(Ui.Row(new ToggleSwitch {IsEnabled=false,OnContent=SettingsReference.Text("settings.enabled"),OffContent=SettingsReference.Text("settings.disabled")},new Button {Content=SettingsReference.Text("common.restoreDefault"),IsEnabled=false}));
        foreach(var id in new[]{"focusMainSearch","hideToLine","restoreDefaultWindow","toggleWindowMode","openSettings","cycleDirectory"})
            column.Children.Add(Pair(SettingsReference.Text("shortcut."+id),SettingsReference.Shortcut(id)));
        return column;
    }
    public static UIElement Commands()
    {
        var column=Ui.Column(new ToggleSwitch {IsEnabled=false,OnContent=SettingsReference.Text("settings.enabled"),OffContent=SettingsReference.Text("settings.disabled")});
        foreach(var group in SettingsReference.CommandGroups.EnumerateArray())
            column.Children.Add(new Expander {Header=group.GetProperty("title").GetString(),Content=CommandRows(group.GetProperty("items")),HorizontalAlignment=HorizontalAlignment.Stretch,HorizontalContentAlignment=HorizontalAlignment.Stretch});
        column.Children.Add(new Expander {Header=SettingsReference.Text("settings.confirmationCommands"),Content=Ui.Column(Ui.Text(SettingsReference.Text("settings.confirmationCommandHint"),true),CommandRows(SettingsReference.DangerousCommands)),HorizontalAlignment=HorizontalAlignment.Stretch,HorizontalContentAlignment=HorizontalAlignment.Stretch});
        return column;
    }
    private static UIElement CommandRows(JsonElement items)
    {
        var column=Ui.Column();
        foreach(var item in items.EnumerateArray())column.Children.Add(Pair(item.GetProperty("command").GetString()??"",item.GetProperty("description").GetString()??""));
        return column;
    }
    private static Grid Pair(string title,string value)
    {
        var grid=new Grid {ColumnSpacing=16,RowSpacing=4};
        grid.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});grid.ColumnDefinitions.Add(new(){Width=new(2,GridUnitType.Star)});
        grid.Children.Add(Ui.Text(title));var text=Ui.Text(value,true);text.IsTextSelectionEnabled=true;Grid.SetColumn(text,1);grid.Children.Add(text);return grid;
    }
}
