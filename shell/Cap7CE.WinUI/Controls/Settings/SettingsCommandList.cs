using Cap7CE.WinUI.Models;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Text;

namespace Cap7CE.WinUI.Controls;

// Read-only reference: category selection never executes commands or changes preferences.
internal sealed class SettingsCommandList : UserControl
{
    public SettingsCommandList(IEnumerable<SettingsHelpGroup> entries)
    {
        var groups=entries.ToArray();
        var selector=L.Choice(new[]{"help.all"}.Concat(groups.Select(g=>g.TitleKey)).ToArray());
        selector.HorizontalAlignment=HorizontalAlignment.Right;
        L.Bind(selector,Microsoft.UI.Xaml.Automation.AutomationProperties.NameProperty,"help.category");
        var rows=Ui.Column();rows.Spacing=16;
        var content=Ui.Column(selector,rows);content.Spacing=16;Content=content;
        void Render()
        {
            rows.Children.Clear();
            for(var i=0;i<groups.Length;i++) {
                if(selector.SelectedIndex>0&&selector.SelectedIndex!=i+1)continue;
                var group=groups[i];var block=Ui.Column();block.Spacing=8;
                var heading=L.Text(group.TitleKey);heading.FontWeight=FontWeights.SemiBold;block.Children.Add(heading);
                if(!string.IsNullOrEmpty(group.HintKey))block.Children.Add(L.Text(group.HintKey,true));
                foreach(var item in group.Items)
                    block.Children.Add(Row(item.Command,item.DescriptionKey,item.ExampleKey));
                rows.Children.Add(block);
            }
        }
        selector.SelectionChanged+=(_,_)=>Render();Render();
    }
    private static UIElement Row(string command,string description,string? exampleKey)
    {
        var grid=new Grid {ColumnSpacing=20,MinHeight=32};
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
        grid.SizeChanged+=(_,_)=>Arrange();Arrange();return grid;
    }
}
