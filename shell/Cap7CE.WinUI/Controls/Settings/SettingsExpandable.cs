using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls;
internal sealed class SettingsExpandable(UIElement body,UIElement? summary=null,UIElement? details=null) : ContentControl
{
    public UIElement? Details {get;}=details;
    public UIElement? Summary {get;}=summary;
    public UIElement Body {get;}=body;
}
