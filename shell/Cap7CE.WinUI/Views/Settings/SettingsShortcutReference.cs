using Cap7CE.WinUI.Controls;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Views;

internal static class SettingsShortcutReference
{
    public static UIElement Commands()
    {
        return new SettingsSection(DisabledToggle(),new SettingsCommandList(SettingsReference.HelpGroups));
    }
    private static ToggleSwitch DisabledToggle()=>L.Toggle(false);
}
