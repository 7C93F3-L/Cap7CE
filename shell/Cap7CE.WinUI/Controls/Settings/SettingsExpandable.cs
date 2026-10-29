using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls;
internal sealed class SettingsExpandable(UIElement body) : ContentControl
{
    public UIElement Body {get;}=body;
}
