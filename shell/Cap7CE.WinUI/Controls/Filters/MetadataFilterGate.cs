using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Cap7CE.WinUI.Controls;

// A separate focusable action preserves mouse/keyboard access without applying the blocked filter.
internal sealed class MetadataFilterGate : Grid
{
    private readonly Control content;
    private readonly Button action=new(){Background=new SolidColorBrush(Microsoft.UI.Colors.Transparent),BorderThickness=new(0),Padding=new(0),MinWidth=0,MinHeight=0,
        HorizontalAlignment=HorizontalAlignment.Stretch,VerticalAlignment=VerticalAlignment.Stretch};
    public MetadataFilterGate(Control content,Action unavailable)
    {
        this.content=content;Children.Add(content);Children.Add(action);
        AutomationProperties.SetName(action,"查看此筛选条件的元数据要求");action.Click+=(_,_)=>unavailable();Set(FilterAvailabilityState.Unknown);
    }
    public void Set(FilterAvailabilityState state)
    {
        var blocked=state is FilterAvailabilityState.Checking or FilterAvailabilityState.Missing or FilterAvailabilityState.Failed;
        content.IsEnabled=!blocked;action.Visibility=blocked?Visibility.Visible:Visibility.Collapsed;
        ToolTipService.SetToolTip(action,state==FilterAvailabilityState.Checking?"正在检查元数据":state==FilterAvailabilityState.Failed?"查看元数据不可用的原因":"点击获取此条件所需的元数据");
    }
}
