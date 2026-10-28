using Cap7CE.WinUI.Controls;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Views;

internal static class SettingsShortcutReference
{
    public static UIElement Actions(UIElement? toggle=null)
    {
        var controls=Ui.Row(toggle??DisabledToggle(),new Button {Content=SettingsReference.Text("common.restoreDefault"),IsEnabled=false});
        var column=Ui.Column();
        foreach(var id in new[]{"focusMainSearch","restoreDefaultWindow","toggleWindowMode","openSettings","cycleDirectory"})
            {var row=ShortcutRow(SettingsReference.Text("shortcut."+id),SettingsReference.Shortcut(id));
            if(id is "toggleWindowMode"){row.Opacity=0.4;ToolTipService.SetToolTip(row,"此窗口动作尚未迁入WinUI，不注册其快捷键。");}column.Children.Add(row);}
        return new SettingsSection(controls,column);
    }
    public static UIElement Commands()
    {
        var groups=SettingsReference.CommandGroups.EnumerateArray()
            .Select(g=>(Title:g.GetProperty("title").GetString()??"",Items:g.GetProperty("items"),Hint:(string?)null)).ToList();
        groups.Add((SettingsReference.Text("settings.confirmationCommands"),SettingsReference.DangerousCommands,SettingsReference.Text("settings.confirmationCommandHint")));
        return new SettingsSection(DisabledToggle(),new SettingsCommandList(groups));
    }
    private static ToggleSwitch DisabledToggle()=>new() {IsEnabled=false,MinWidth=0,
        OnContent=SettingsReference.Text("settings.enabled"),OffContent=SettingsReference.Text("settings.disabled")};
    private static UIElement ShortcutRow(string title,string shortcut)
    {
        var row=new Grid {ColumnSpacing=20,MinHeight=36};
        row.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        row.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        var label=Ui.Text(title);label.VerticalAlignment=VerticalAlignment.Center;row.Children.Add(label);
        var key=new Border {Style=(Style)Application.Current.Resources["CapSettingsKeycap"]};
        var text=Ui.Text(shortcut,true);text.HorizontalAlignment=HorizontalAlignment.Center;text.IsTextSelectionEnabled=true;key.Child=text;
        Grid.SetColumn(key,1);row.Children.Add(key);return row;
    }
}
