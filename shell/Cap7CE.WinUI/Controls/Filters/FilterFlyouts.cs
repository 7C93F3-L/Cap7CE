using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Cap7CE.WinUI.Themes;

namespace Cap7CE.WinUI.Controls;

internal sealed class FilterFlyouts
{
    private Flyout? current;
    public void Close() {current?.Hide();current=null;}
    public void Show(FrameworkElement anchor,UIElement content,Action? closed=null)
    {
        if(content is FrameworkElement element)FilterControlTheme.Apply(element);
        Close();var flyout=ThemeService.Flyout(content);current=flyout;
        if(anchor is ButtonBase button)HoverReveal.Hold(button,true);
        flyout.Closed+=(_,_)=>{if(ReferenceEquals(current,flyout))current=null;if(anchor is ButtonBase action)HoverReveal.Hold(action,false);closed?.Invoke();};
        flyout.ShowAt(anchor);
    }
}
