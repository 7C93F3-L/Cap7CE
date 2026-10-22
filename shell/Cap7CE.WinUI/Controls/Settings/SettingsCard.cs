using Cap7CE.WinUI.Controls;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Text;

namespace Cap7CE.WinUI.Controls;

internal sealed class SettingsCard : UserControl
{
    public SettingsCard(string title,string description,UIElement control,bool expanded=false)
    {
        var copy=Ui.Column(new TextBlock {Text=title,FontWeight=FontWeights.SemiBold,TextWrapping=TextWrapping.Wrap},Ui.Text(description,true));
        copy.Spacing=5;
        var grid=new Grid {ColumnSpacing=20,RowSpacing=12};
        grid.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        grid.ColumnDefinitions.Add(new(){Width=new(280)});
        grid.RowDefinitions.Add(new(){Height=GridLength.Auto});grid.RowDefinitions.Add(new(){Height=GridLength.Auto});
        var element=(FrameworkElement)control;
        var hasAction=control is not TextBlock {Text.Length:0};
        element.HorizontalAlignment=control is ToggleSwitch or Button?HorizontalAlignment.Right:HorizontalAlignment.Stretch;
        var action=new ContentControl {Content=control,HorizontalContentAlignment=HorizontalAlignment.Stretch,VerticalAlignment=VerticalAlignment.Center};
        grid.Children.Add(copy);grid.Children.Add(action);
        if(control is Control accessible)AutomationProperties.SetName(accessible,title);
        void Arrange()
        {
            var stacked=expanded||ActualWidth<620;
            grid.RowSpacing=stacked&&hasAction?12:0;
            grid.ColumnDefinitions[1].Width=new(stacked||!hasAction?0:280);
            Grid.SetColumnSpan(copy,stacked||!hasAction?2:1);Grid.SetRow(action,stacked?1:0);
            Grid.SetColumn(action,stacked?0:1);Grid.SetColumnSpan(action,stacked?2:1);
            action.MaxWidth=expanded?double.PositiveInfinity:280;
            action.Width=hasAction&&!expanded&&ActualWidth>0?Math.Min(280,Math.Max(0,ActualWidth-34)):double.NaN;
            action.HorizontalAlignment=expanded?HorizontalAlignment.Stretch:HorizontalAlignment.Right;
            action.Visibility=hasAction?Visibility.Visible:Visibility.Collapsed;
        }
        Content=new Border {Style=(Style)Application.Current.Resources["CapSettingsCard"],Child=grid};
        SizeChanged+=(_,_)=>Arrange();Arrange();
    }
}
