using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls;
internal sealed class FactFilterEditor : UserControl
{
    private readonly Action<CoreSearchFactFilter?> apply;
    private readonly string[] domains = ["image-dimensions", "video", "audio", "document", "three-d", "font", "model", "text-data", "archive"];
    public FactFilterEditor(Action<CoreSearchFactFilter?> apply)
    {
        this.apply = apply;
        Content = Ui.Column(Ui.Text("详细属性", true), Ui.Button("尺寸 / 比例 / 时长…", Show), Ui.Button("清除属性条件", () => apply(null)));
    }
    private void Show()
    {
        var kind = Ui.Select(["图像", "视频", "音频", "文档", "三维", "字体", "模型", "文本 / 数据", "压缩包"], 0, _ => { });
        NumberBox width = Number("最小宽度 px"), height = Number("最小高度 px"), duration = Number("最小时长 秒"), count = Number("最小数量（页 / 三角面 / 参数 / 字符 / 文件）");
        var ratio = Ui.Select(["不限比例", "横向 ≥ 16:9", "正方形 1:1", "竖向 ≤ 3:4"], 0, _ => { });
        var chinese = new CheckBox { Content = "支持中文样字" }; var latin = new CheckBox { Content = "支持拉丁样字" };
        void Configure()
        {
            var domain = domains[kind.SelectedIndex];
            width.IsEnabled = height.IsEnabled = ratio.IsEnabled = domain is "image-dimensions" or "video";
            duration.IsEnabled = domain is "video" or "audio";
            count.IsEnabled = domain is "document" or "three-d" or "model" or "text-data" or "archive";
            chinese.IsEnabled = latin.IsEnabled = domain == "font";
            count.Header = domain switch { "document" => "最少页 / 幻灯片 / 工作表", "three-d" => "最少三角面", "model" => "最少参数", "text-data" => "最少字符（文本）", "archive" => "最少文件", _ => "数量（当前类型不适用）" };
        }
        kind.SelectionChanged += (_, _) => Configure(); Configure();
        var error = Ui.Text("", true);
        var columns = Ui.Column(Ui.Heading("已有属性筛选"), kind, width, height, duration, count, ratio, chinese, latin, Ui.Text("仅查询已提取属性；不会启动内容提取。", true), error);
        var flyout = ThemeService.Flyout(columns);
        columns.Children.Add(Ui.Button("应用", () => {
            var domain = domains[kind.SelectedIndex]; var number = double.IsNaN(count.Value) ? (long?)null : (long)count.Value;
            var hasCondition = width.IsEnabled && (!double.IsNaN(width.Value) || !double.IsNaN(height.Value) || ratio.SelectedIndex > 0)
                || duration.IsEnabled && !double.IsNaN(duration.Value) || count.IsEnabled && number.HasValue
                || chinese.IsEnabled && (chinese.IsChecked == true || latin.IsChecked == true);
            if (!hasCondition) { error.Text = "请先设置当前类型的属性条件"; return; }
            var filter = new CoreSearchFactFilter(domain, FormatRegistry.ExtractorVersion(domain),
                MinimumWidth: domain is "image-dimensions" or "video" ? Integer(width) : null,
                MinimumHeight: domain is "image-dimensions" or "video" ? Integer(height) : null,
                MinimumDurationMilliseconds: domain is "video" or "audio" && !double.IsNaN(duration.Value) ? (long)(duration.Value*1000) : null,
                MinimumAspectRatio: ratio.IsEnabled && ratio.SelectedIndex is 1 or 2 ? new(ratio.SelectedIndex == 1 ? 16 : 1, ratio.SelectedIndex == 1 ? 9 : 1) : null,
                MaximumAspectRatio: ratio.IsEnabled && ratio.SelectedIndex is 2 or 3 ? new(ratio.SelectedIndex == 3 ? 3 : 1, ratio.SelectedIndex == 3 ? 4 : 1) : null,
                Font: domain == "font" ? new(SupportsChinese: chinese.IsChecked == true ? true : null, SupportsLatin: latin.IsChecked == true ? true : null) : null,
                Document: domain == "document" ? new(MinimumContentCount: (int?)number) : null,
                ThreeD: domain == "three-d" ? new(MinimumTriangleCount: number) : null,
                Model: domain == "model" ? new([new(number, null)]) : null,
                TextData: domain == "text-data" ? new("text", MinimumCharacterCount: number) : null,
                Archive: domain == "archive" ? new(MinimumFileCount: (int?)number) : null);
            apply(filter); flyout.Hide();
        })); flyout.ShowAt(this);
    }
    private static NumberBox Number(string heading) => new() { Header = heading, Minimum = 0, Maximum = int.MaxValue, Value = double.NaN, Width = 280 };
    private static int? Integer(NumberBox number) => double.IsNaN(number.Value) ? null : (int)number.Value;
}
