using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Automation.Peers;

namespace Cap7CE.WinUI.Controls;

internal static class SettingsNavigationAppearance
{
    // Preserve NavigationView's nonempty title/measurement; hide only its text.
    public static void HideTitle(DependencyObject parent)
    {
        if(parent is TextBlock {Name:"PaneTitleTextBlock"} title) {
            title.Opacity=0;title.IsHitTestVisible=false;AutomationProperties.SetAccessibilityView(title,AccessibilityView.Raw);return;
        }
        for(var i=0;i<VisualTreeHelper.GetChildrenCount(parent);i++)HideTitle(VisualTreeHelper.GetChild(parent,i));
    }
}
