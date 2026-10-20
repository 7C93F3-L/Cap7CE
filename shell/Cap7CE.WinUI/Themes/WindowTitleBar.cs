using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Cap7CE.WinUI.Themes;

internal sealed class WindowTitleBar : Grid
{
    private readonly Grid dragRegion = new() { Height = 48, Background = new SolidColorBrush(Colors.Transparent) };

    private WindowTitleBar(FrameworkElement content)
    {
        RowDefinitions.Add(new() { Height = GridLength.Auto });
        RowDefinitions.Add(new() { Height = new(1, GridUnitType.Star) });
        Children.Add(dragRegion);
        SetRow(content, 1);
        Children.Add(content);
    }

    public static void Apply(Window window, ElementTheme theme)
    {
        if (window.Content is not WindowTitleBar frame)
        {
            var content = (FrameworkElement)window.Content;
            window.Content = null;
            frame = new(content);
            window.Content = frame;
            window.ExtendsContentIntoTitleBar = true;
            window.AppWindow.TitleBar.PreferredHeightOption = TitleBarHeightOption.Tall;
            window.SetTitleBar(frame.dragRegion);
        }
        frame.RequestedTheme = theme;
        window.AppWindow.TitleBar.ButtonBackgroundColor = Colors.Transparent;
        window.AppWindow.TitleBar.ButtonInactiveBackgroundColor = Colors.Transparent;
    }
}
