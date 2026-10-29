using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls;
internal sealed class SettingsPageLink : Button
{
    public SettingsPageLink(Action open){Content=new FontIcon{Glyph="\uE76C",FontSize=12};Click+=(_,_)=>open();}
}
