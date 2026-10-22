using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls;

// A card with a header action and a separate, full-width reference body.
internal sealed class SettingsSection(UIElement actions,UIElement body) : UserControl
{
    public UIElement Actions {get;}=actions;
    public UIElement Body {get;}=body;
    public void AttachBody()=>Content=Body;
}
