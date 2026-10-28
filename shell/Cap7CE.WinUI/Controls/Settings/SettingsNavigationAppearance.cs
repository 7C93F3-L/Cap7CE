using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Automation.Peers;
using Cap7CE.WinUI.Localization;

namespace Cap7CE.WinUI.Controls;

internal static class SettingsNavigationAppearance
{
    // Preserve NavigationView's nonempty title/measurement; hide only its text.
    public static void Apply(NavigationView navigation)=>Apply(navigation,navigation.IsPaneOpen);
    private static void Apply(DependencyObject parent,bool paneOpen)
    {
        if(parent is TextBlock {Name:"PaneTitleTextBlock"} title) {
            title.Opacity=0;title.IsHitTestVisible=false;AutomationProperties.SetAccessibilityView(title,AccessibilityView.Raw);return;
        }
        if(parent is Button {Name:"TogglePaneButton"} toggle)
            LanguageUi.Label(toggle,paneOpen?"navigation.close":"navigation.open");
        if(parent is Button {Name:"NavigationViewCloseButton"} close)
            LanguageUi.Label(close,"navigation.close");
        for(var i=0;i<VisualTreeHelper.GetChildrenCount(parent);i++)Apply(VisualTreeHelper.GetChild(parent,i),paneOpen);
    }
}
