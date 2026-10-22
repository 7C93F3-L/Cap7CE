using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Text;

namespace Cap7CE.WinUI.Controls;

// Read-only reference: category selection never executes commands or changes preferences.
internal sealed class SettingsCommandList : UserControl
{
    public SettingsCommandList(IEnumerable<(string Title,JsonElement Items,string? Hint)> entries)
    {
        var groups=entries.ToArray();
        var selector=new ComboBox {ItemsSource=new[]{"全部"}.Concat(groups.Select(g=>g.Title)).ToArray(),
            SelectedIndex=0,MinWidth=160,HorizontalAlignment=HorizontalAlignment.Right};
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(selector,"快捷指令分类");
        var rows=Ui.Column();rows.Spacing=16;
        var content=Ui.Column(selector,rows);content.Spacing=16;Content=content;
        void Render()
        {
            rows.Children.Clear();
            for(var i=0;i<groups.Length;i++) {
                if(selector.SelectedIndex>0&&selector.SelectedIndex!=i+1)continue;
                var group=groups[i];var block=Ui.Column();block.Spacing=8;
                var heading=Ui.Text(group.Title);heading.FontWeight=FontWeights.SemiBold;block.Children.Add(heading);
                if(!string.IsNullOrEmpty(group.Hint))block.Children.Add(Ui.Text(group.Hint,true));
                foreach(var item in group.Items.EnumerateArray())
                    block.Children.Add(Row(item.GetProperty("command").GetString()??"",item.GetProperty("description").GetString()??""));
                rows.Children.Add(block);
            }
        }
        selector.SelectionChanged+=(_,_)=>Render();Render();
    }
    private static UIElement Row(string command,string description)
    {
        var grid=new Grid {ColumnSpacing=20,MinHeight=32};
        grid.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        grid.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        grid.RowDefinitions.Add(new(){Height=GridLength.Auto});grid.RowDefinitions.Add(new(){Height=GridLength.Auto});
        var code=Ui.Text(command);code.FontFamily=new FontFamily("Consolas");code.IsTextSelectionEnabled=true;
        var detail=Ui.Text(description,true);detail.IsTextSelectionEnabled=true;
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
