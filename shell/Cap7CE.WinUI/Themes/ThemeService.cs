using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Composition.SystemBackdrops;
using Cap7CE.WinUI.Models;
using Windows.UI;

namespace Cap7CE.WinUI.Themes;
internal static class ThemeService
{
    public static void Apply(Window window, FrameworkElement root, ShellPreferences settings)
    {
        root.RequestedTheme = settings.Theme switch { "light" => ElementTheme.Light, "dark" => ElementTheme.Dark, _ => ElementTheme.Default };
        window.SystemBackdrop = new MicaBackdrop { Kind = settings.Material == "mica-alt" ? MicaKind.BaseAlt : MicaKind.Base };
        if (root is Control control) control.FontSize = settings.FontSize;
        root.SetValue(Control.FontSizeProperty, settings.FontSize);
        ((SolidColorBrush)Application.Current.Resources["CapAccentBrush"]).Color = Parse(settings.Color1);
        ((SolidColorBrush)Application.Current.Resources["CapSecondaryBrush"]).Color = Parse(settings.Color2);
        ((SolidColorBrush)Application.Current.Resources["AccentFillColorDefaultBrush"]).Color = Parse(settings.Color1);
        var gradient = (LinearGradientBrush)Application.Current.Resources["CapAccentGradient"];
        gradient.GradientStops[0].Color = Parse(settings.Color1); gradient.GradientStops[1].Color = Parse(settings.Color2);
    }
    public static Color Parse(string hex)
    {
        if (hex.Length != 7 || hex[0] != '#' || !uint.TryParse(hex[1..], System.Globalization.NumberStyles.HexNumber, null, out var value)) return Color.FromArgb(255,120,148,248);
        return Color.FromArgb(255, (byte)(value >> 16), (byte)(value >> 8), (byte)value);
    }
    public static MenuFlyout Menu() => new() { SystemBackdrop = new DesktopAcrylicBackdrop() };
    public static Flyout Flyout(UIElement content) => new() { Content = content, SystemBackdrop = new DesktopAcrylicBackdrop() };
}
