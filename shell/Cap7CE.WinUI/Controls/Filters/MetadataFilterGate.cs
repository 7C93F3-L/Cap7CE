using Cap7CE.WinUI.Models;
using L=Cap7CE.WinUI.Localization.LanguageUi;
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
        L.Bind(action,AutomationProperties.NameProperty,"ui.facts.metadataRequirements");action.Click+=(_,_)=>unavailable();Set(FilterAvailabilityState.Unknown);
    }
    public void Set(FilterAvailabilityState state)
    {
        var blocked=state is FilterAvailabilityState.Checking or FilterAvailabilityState.Missing or FilterAvailabilityState.Failed;
        content.IsEnabled=!blocked;action.Visibility=blocked?Visibility.Visible:Visibility.Collapsed;
        L.Bind(action,ToolTipService.ToolTipProperty,state==FilterAvailabilityState.Checking?"ui.facts.checkingMetadata":state==FilterAvailabilityState.Failed?"ui.facts.metadataReason":"ui.facts.getMetadata");
    }
}
