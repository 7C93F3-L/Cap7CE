using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls;

internal sealed class SettingsFieldRow : UserControl
{
    public SettingsFieldRow(string label,UIElement value,UIElement? action=null)
    {
        var grid=new Grid {ColumnSpacing=16,RowSpacing=5,MinHeight=32};
        grid.ColumnDefinitions.Add(new(){Width=new(152)});
        grid.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        grid.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        grid.RowDefinitions.Add(new(){Height=GridLength.Auto});grid.RowDefinitions.Add(new(){Height=GridLength.Auto});
        var title=Ui.Text(label);title.VerticalAlignment=VerticalAlignment.Center;
        var field=(FrameworkElement)value;field.VerticalAlignment=VerticalAlignment.Center;
        field.HorizontalAlignment=HorizontalAlignment.Right;
        if(field is TextBlock text)text.TextAlignment=TextAlignment.Right;
        grid.Children.Add(title);grid.Children.Add(value);
        if(action is FrameworkElement button){button.HorizontalAlignment=HorizontalAlignment.Right;button.VerticalAlignment=VerticalAlignment.Center;Grid.SetColumn(button,2);grid.Children.Add(button);}
        void Arrange()
        {
            var stacked=ActualWidth<480;
            grid.RowSpacing=stacked?5:0;
            grid.ColumnDefinitions[0].Width=new(stacked?0:152);
            Grid.SetColumnSpan(title,stacked?3:1);
            Grid.SetColumn(field,stacked?0:1);Grid.SetColumnSpan(field,stacked?2:1);Grid.SetRow(field,stacked?1:0);
            if(action is FrameworkElement button)Grid.SetRow(button,stacked?1:0);
        }
        Content=grid;SizeChanged+=(_,_)=>Arrange();Arrange();
    }
}
