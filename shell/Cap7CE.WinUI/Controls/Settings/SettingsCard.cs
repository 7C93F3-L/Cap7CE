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
        grid.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        grid.RowDefinitions.Add(new(){Height=GridLength.Auto});grid.RowDefinitions.Add(new(){Height=GridLength.Auto});
        grid.Children.Add(copy);grid.Children.Add(control);
        var action=(FrameworkElement)control; action.VerticalAlignment=VerticalAlignment.Center;
        if(control is Control accessible)AutomationProperties.SetName(accessible,title);
        void Arrange()
        {
            var stacked=expanded||ActualWidth<620;
            Grid.SetColumnSpan(copy,stacked?2:1);Grid.SetRow(action,stacked?1:0);
            Grid.SetColumn(action,stacked?0:1);Grid.SetColumnSpan(action,stacked?2:1);
            action.HorizontalAlignment=stacked?HorizontalAlignment.Stretch:HorizontalAlignment.Right;
        }
        Content=new Border {Style=(Style)Application.Current.Resources["CapSettingsCard"],Child=grid};
        SizeChanged+=(_,_)=>Arrange();Arrange();
    }
}
