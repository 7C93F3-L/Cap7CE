using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Themes;

namespace Cap7CE.WinUI.Controls;
internal sealed class FilterBar : UserControl
{
    private readonly StackPanel row = new() { Orientation = Orientation.Horizontal, Spacing = 12 };
    private readonly TextBlock count = Ui.Text("筛选 · 0");
    private readonly VariableSizedWrapGrid kinds = new() { Orientation = Orientation.Horizontal, MaximumRowsOrColumns = 6, ItemWidth = 62, ItemHeight = 28 };
    private readonly List<ToggleButtonAdapter> categoryButtons = [];
    public BrowseFilter Value { get; private set; } = new();
    public event Action<BrowseFilter>? FilterChanged;
    public FilterBar()
    {
        row.Children.Add(Ui.Column(count, Ui.Button("清除", () => Set(new()))));
        row.Children.Add(Group("修改时间", Ui.Row(Time("不限", null), Time("今天", DateTimeOffset.Now.Date), Time("近7天", DateTimeOffset.Now.AddDays(-7))),
            Ui.Row(Time("近30天", DateTimeOffset.Now.AddDays(-30)), Ui.Button("自定义…", Dates))));
        foreach (var category in FormatRegistry.Categories)
        {
            var button = new Microsoft.UI.Xaml.Controls.Primitives.ToggleButton { Content = category.Label, Padding = new(6,2,6,2), Margin = new(1), FontSize = 12, MinWidth = 0 };
            button.Click += (_, _) => Set(Value with { Category = Value.Category == category.Id ? "" : category.Id, Extensions = [], Facts = null });
            categoryButtons.Add(new(category.Id, button)); kinds.Children.Add(button);
        }
        row.Children.Add(Group("文件种类", kinds));
        row.Children.Add(Group("大小 / 格式", Ui.Row(Size("不限", null, null), Size("小于1MB", null, 1024*1024)),
            Ui.Row(Size("1–100MB", 1024*1024,100*1024*1024), Size("大于100MB",100*1024*1024,null)), Ui.Button("自定义…", SizeAndFormat)));
        row.Children.Add(new FactFilterEditor(filter => Set(Value with { Facts = filter })));
        Content = new Border { Style = (Style)Application.Current.Resources["CapWorkspacePanel"], Child = new ScrollViewer {
            Content = row, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto,
            VerticalScrollBarVisibility = ScrollBarVisibility.Disabled, HorizontalScrollMode = ScrollMode.Enabled, VerticalScrollMode = ScrollMode.Disabled } };
    }
    public void Restore(BrowseFilter filter) { Value = filter; Render(); }
    private void Set(BrowseFilter filter) { Value = filter; Render(); FilterChanged?.Invoke(filter); }
    private void Render() { count.Text = $"筛选 · {Value.Count}"; foreach (var entry in categoryButtons) entry.Button.IsChecked = entry.Id == Value.Category; }
    private static StackPanel Group(string title, params UIElement[] children) { var group = Ui.Column(Ui.Text(title, true)); group.Spacing = 3; foreach (var child in children) group.Children.Add(child); return group; }
    private Button Time(string label, DateTimeOffset? after) => Ui.Button(label, () => Set(Value with { After = after, Before = null }));
    private Button Size(string label, long? min, long? max) => Ui.Button(label, () => Set(Value with { MinimumBytes = min, MaximumBytes = max }));
    private void Dates()
    {
        var start = new CalendarDatePicker { PlaceholderText = "开始日期", Date = Value.After };
        var end = new CalendarDatePicker { PlaceholderText = "结束日期", Date = Value.Before };
        var error = Ui.Text("", true); var column = Ui.Column(start, end, error);
        var flyout = ThemeService.Flyout(column);
        column.Children.Add(Ui.Button("应用", () => {
            if (start.Date > end.Date) { error.Text = "结束日期不能早于开始日期"; return; }
            Set(Value with { After = start.Date, Before = end.Date?.AddDays(1) }); flyout.Hide();
        })); flyout.ShowAt(this);
    }
    private void SizeAndFormat()
    {
        var min = new NumberBox { Header = "最小 MB", Value = Value.MinimumBytes / 1048576d ?? double.NaN, Minimum = 0, Maximum = 1e12, Width = 220 };
        var max = new NumberBox { Header = "最大 MB", Value = Value.MaximumBytes / 1048576d ?? double.NaN, Minimum = 0, Maximum = 1e12 };
        var formats = new TextBox { Header = "扩展名，以空格或逗号分隔", Text = string.Join(" ", Value.Extensions), PlaceholderText = ".png .jpg .psd" };
        var error = Ui.Text("", true); var column = Ui.Column(min, max, formats, error); var flyout = ThemeService.Flyout(column);
        column.Children.Add(Ui.Button("应用", () => {
            var extensions = formats.Text.Split([' ', ',', ';', '，'], StringSplitOptions.RemoveEmptyEntries).Select(s => "." + s.TrimStart('.').ToLowerInvariant()).Distinct().ToArray();
            if (extensions.Length > 128 || extensions.Any(s => s.Length > 24 || s.Skip(1).Any(c => !char.IsLetterOrDigit(c)))) { error.Text = "扩展名无效"; return; }
            if (!double.IsNaN(min.Value) && !double.IsNaN(max.Value) && min.Value > max.Value) { error.Text = "大小范围无效"; return; }
            Set(Value with { Extensions = extensions, Category = extensions.Length > 0 ? "" : Value.Category,
                MinimumBytes = double.IsNaN(min.Value) ? null : checked((long)(min.Value * 1048576)), MaximumBytes = double.IsNaN(max.Value) ? null : checked((long)(max.Value * 1048576)) }); flyout.Hide();
        })); flyout.ShowAt(this);
    }
    private sealed record ToggleButtonAdapter(string Id, Microsoft.UI.Xaml.Controls.Primitives.ToggleButton Button);
}
