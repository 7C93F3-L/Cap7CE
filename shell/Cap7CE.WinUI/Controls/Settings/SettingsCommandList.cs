using Cap7CE.WinUI.Models;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Text;

namespace Cap7CE.WinUI.Controls;

// Read-only reference: expanding a category never executes commands or changes preferences.
internal sealed class SettingsCommandList : UserControl
{
    public SettingsCommandList(IEnumerable<SettingsHelpGroup> entries)
    {
        var groups=Ui.Column();groups.Spacing=6;
        foreach(var group in entries){
            var rows=Ui.Column();rows.Spacing=0;
            if(!string.IsNullOrEmpty(group.HintKey)){
                var hint=L.Text(group.HintKey,true);hint.Margin=new(12,4,12,12);rows.Children.Add(hint);
            }
            for(var i=0;i<group.Items.Length;i++){
                var item=group.Items[i];rows.Children.Add(Row(item.Command,item.DescriptionKey,item.ExampleKey,i==group.Items.Length-1));
            }
            var heading=L.Text(group.TitleKey);heading.Style=(Style)Application.Current.Resources["CapSettingsLabel"];heading.FontWeight=FontWeights.SemiBold;
            var expander=new Expander{Header=heading,Content=rows,IsExpanded=false,Style=(Style)Application.Current.Resources["CapSettingsExpander"]};
            expander.Expanding+=(_,_)=>Services.SessionDiagnostics.Record("trace.settings.command.expand",new{group=group.TitleKey});
            expander.Collapsed+=(_,_)=>Services.SessionDiagnostics.Record("trace.settings.command.collapse",new{group=group.TitleKey});
            L.Bind(expander,Microsoft.UI.Xaml.Automation.AutomationProperties.NameProperty,group.TitleKey);
            groups.Children.Add(expander);
        }
        Content=groups;
    }
    private static UIElement Row(string command,string description,string? exampleKey,bool last)
    {
        var grid=new Grid {ColumnSpacing=20};
        grid.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        grid.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        grid.RowDefinitions.Add(new(){Height=GridLength.Auto});grid.RowDefinitions.Add(new(){Height=GridLength.Auto});
        var code=exampleKey is null?Ui.Text(command):L.Text(exampleKey);code.FontFamily=new FontFamily("Consolas");code.IsTextSelectionEnabled=true;
        var detail=L.Text(description,true);detail.IsTextSelectionEnabled=true;
        grid.Children.Add(code);grid.Children.Add(detail);Grid.SetColumn(detail,1);
        void Arrange()
        {
            var stacked=grid.ActualWidth<460;
            Grid.SetColumnSpan(code,stacked?2:1);Grid.SetColumn(detail,stacked?0:1);
            Grid.SetColumnSpan(detail,stacked?2:1);Grid.SetRow(detail,stacked?1:0);grid.RowSpacing=stacked?4:0;
        }
        var host=new Border{Style=(Style)Application.Current.Resources["CapSettingsCommandRow"],Child=grid};
        if(last)host.BorderThickness=new(0);
        host.SizeChanged+=(_,_)=>Arrange();Arrange();return host;
    }
}
