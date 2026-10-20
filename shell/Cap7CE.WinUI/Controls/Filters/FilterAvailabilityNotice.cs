using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls;
internal sealed class FilterAvailabilityNotice : UserControl
{
    private readonly Button button;
    private readonly FilterFlyouts flyouts;
    private FilterAvailability current=FilterAvailability.Empty;
    public event Action? Retry;
    public FilterAvailabilityNotice(FilterFlyouts flyouts)
    {this.flyouts=flyouts;button=FilterSection.ActionButton("属性信息",Show);Content=button;Visibility=Visibility.Collapsed;}
    public void Set(FilterAvailability value)
    {
        current=value;var states=value.States.Values;
        Visibility=states.Any(state=>state is FilterAvailabilityState.Checking or FilterAvailabilityState.Missing or FilterAvailabilityState.Failed)?Visibility.Visible:Visibility.Collapsed;
        button.Content=states.Contains(FilterAvailabilityState.Checking)?"检查属性…":states.Contains(FilterAvailabilityState.Failed)?"检查未完成":"属性待补";
    }
    private void Show()
    {
        var checking=current.States.Values.Contains(FilterAvailabilityState.Checking);
        var failed=current.States.Values.Contains(FilterAvailabilityState.Failed);
        var colors=current.States.Any(pair=>pair.Key.EndsWith(":colors")&&pair.Value==FilterAvailabilityState.Missing);
        var missing=current.States.Any(pair=>!pair.Key.EndsWith(":colors")&&pair.Value==FilterAvailabilityState.Missing);
        var text=checking?"正在检查当前目录与文件类型的已有属性。":failed?"当前范围的属性状态未能确认，可以重新检查。":missing?"当前范围部分详细属性尚不可用；对应筛选已暂时禁用。":colors?"当前范围尚无可用的颜色信息。其他已有属性可继续筛选。":"当前范围的详细属性可用。";
        var message=Ui.Text(text);message.MaxWidth=310;
        var help=Ui.Text("属性和颜色需先在 Electron 主线提取，完成后点“重新检查”。",true);help.MaxWidth=310;
        var content=Ui.Column(message);if(!checking)content.Children.Add(help);
        content.Children.Add(Ui.Button("重新检查",()=>{flyouts.Close();Retry?.Invoke();}));flyouts.Show(button,content);
    }
}
