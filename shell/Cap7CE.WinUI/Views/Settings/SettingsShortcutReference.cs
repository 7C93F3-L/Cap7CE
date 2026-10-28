using Cap7CE.WinUI.Controls;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Views;

internal static class SettingsShortcutReference
{
    public static UIElement Actions(UIElement? toggle=null)
    {
        var controls=Ui.Row(toggle??DisabledToggle(),L.Button("common.restoreDefault",()=>{}));
        ((Control)controls.Children[1]).IsEnabled=false;var column=Ui.Column();
        foreach(var id in new[]{"focusMainSearch","restoreDefaultWindow","toggleWindowMode","openSettings","cycleDirectory"})
            {var row=ShortcutRow("shortcut."+id,SettingsReference.Shortcut(id));
            if(id is "toggleWindowMode"){row.Opacity=0.4;L.Bind(row,ToolTipService.ToolTipProperty,"native.shortcut.unavailable");}column.Children.Add(row);}
        return new SettingsSection(controls,column);
    }
    public static UIElement Commands()
    {
        return new SettingsSection(DisabledToggle(),new SettingsCommandList(SettingsReference.HelpGroups));
    }
    private static ToggleSwitch DisabledToggle()=>L.Toggle(false);
    private static FrameworkElement ShortcutRow(string title,string shortcut)
    {
        var row=new Grid {ColumnSpacing=20,MinHeight=36};
        row.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        row.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        var label=L.Text(title);label.VerticalAlignment=VerticalAlignment.Center;row.Children.Add(label);
        var key=new Border {Style=(Style)Application.Current.Resources["CapSettingsKeycap"]};
        var text=Ui.Text(shortcut,true);text.HorizontalAlignment=HorizontalAlignment.Center;text.IsTextSelectionEnabled=true;key.Child=text;
        Grid.SetColumn(key,1);row.Children.Add(key);return row;
    }
}
