using Cap7CE.WinUI.Controls;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Views;

internal static class SettingsShortcutReference
{
    public static UIElement Commands()
    {
        return Ui.Column(L.Text("ui.settings.referenceOnly",true),new SettingsCommandList(SettingsReference.HelpGroups));
    }
}
