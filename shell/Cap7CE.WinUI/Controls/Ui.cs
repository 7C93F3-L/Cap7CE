using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Microsoft.UI.Xaml.Automation;

namespace Cap7CE.WinUI.Controls;
internal static class Ui
{
    public static TextBlock Text(string text, bool muted = false) => new() { Text = text, TextWrapping = TextWrapping.Wrap,
        Style = muted ? (Style)Application.Current.Resources["CapMutedText"] : null };
    public static TextBlock Heading(string text) => new() { Text = text, Style = (Style)Application.Current.Resources["CapHeading"] };
    public static Button Tool(string glyph, string label, Action action)
    {
        var button = new Button { Content = new FontIcon { Glyph = glyph, FontSize = 16 }, Style = (Style)Application.Current.Resources["CapToolButton"] };
        ToolTipService.SetToolTip(button, label); AutomationProperties.SetName(button, label); button.Click += (_, _) => action(); return button;
    }
    public static Button Button(string label, Action action) { var button = new Button { Content = label }; button.Click += (_, _) => action(); return button; }
    public static StackPanel Row(params UIElement[] children) { var row = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 6 }; foreach (var child in children) row.Children.Add(child); return row; }
    public static StackPanel Column(params UIElement[] children) { var column = new StackPanel { Spacing = 10 }; foreach (var child in children) column.Children.Add(child); return column; }
    public static Border Panel(UIElement child) => new() { Style = (Style)Application.Current.Resources["CapPanel"], Child = child };
    public static MenuFlyoutItem MenuItem(string label, Action action, string? glyph = null)
    { var item = new MenuFlyoutItem { Text = label }; if (glyph is not null) item.Icon = new FontIcon { Glyph = glyph }; item.Click += (_, _) => action(); return item; }
    public static Image Icon(string name, double size = 24) => new() { Width = size, Height = size,
        Source = new SvgImageSource(new Uri("ms-appx:///Assets/Icons/" + name + ".svg")), Stretch = Stretch.Uniform };
    public static ComboBox Select(IEnumerable<string> labels, int selected, Action<int> changed)
    { var box = new ComboBox { ItemsSource = labels.ToArray(), SelectedIndex = selected, MinWidth = 120 }; box.SelectionChanged += (_, _) => { if (box.SelectedIndex >= 0) changed(box.SelectedIndex); }; return box; }
}
