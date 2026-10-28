using Cap7CE.WinUI.Controls;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Text;

namespace Cap7CE.WinUI.Controls;

internal sealed class SettingsCard : UserControl
{
    public SettingsCard(string title,string description,UIElement control,bool expanded=false,bool localized=false)
    {
        var section=control as SettingsSection;
        if(section is not null){control=section.Actions;expanded=false;}
        var label=localized?Localization.LanguageUi.Text(title):Ui.Text(title);label.FontWeight=FontWeights.SemiBold;
        var copy=Ui.Column(label,localized?Localization.LanguageUi.Text(description,true):Ui.Text(description,true));
        copy.Spacing=4;
        var grid=new Grid {ColumnSpacing=20,RowSpacing=12};
        grid.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        grid.ColumnDefinitions.Add(new(){Width=new(280)});
        grid.RowDefinitions.Add(new(){Height=GridLength.Auto});grid.RowDefinitions.Add(new(){Height=GridLength.Auto});
        var element=(FrameworkElement)control;
        var compact=control is ToggleSwitch or Button or StackPanel {Orientation:Orientation.Horizontal};
        var actionWidth=control is ComboBox?240:280;
        var hasAction=control is not TextBlock {Text.Length:0};
        if(control is ToggleSwitch toggle)toggle.MinWidth=0;
        if(!expanded&&control is StackPanel panel) {
            foreach(var child in panel.Children.OfType<FrameworkElement>()) {
                if(child is Button or TextBlock or StackPanel {Orientation:Orientation.Horizontal})child.HorizontalAlignment=HorizontalAlignment.Right;
                if(child is TextBlock text)text.TextAlignment=TextAlignment.Right;
            }
        }
        element.HorizontalAlignment=control is ToggleSwitch or Button?HorizontalAlignment.Right:HorizontalAlignment.Stretch;
        var action=new ContentControl {Content=control,HorizontalContentAlignment=HorizontalAlignment.Stretch,VerticalAlignment=VerticalAlignment.Center};
        grid.Children.Add(copy);grid.Children.Add(action);
        if(section is not null) {
            section.AttachBody();section.Margin=new(0,12,0,0);
            grid.RowDefinitions.Add(new(){Height=GridLength.Auto});
            Grid.SetRow(section,2);Grid.SetColumnSpan(section,2);grid.Children.Add(section);
        }
        if(control is Control accessible){if(localized)Localization.LanguageUi.Bind(accessible,AutomationProperties.NameProperty,title);else AutomationProperties.SetName(accessible,title);}
        void Arrange()
        {
            var stacked=expanded||ActualWidth<(compact?460:actionWidth+280);
            if(section is not null)section.Margin=stacked?new(0):new(0,12,0,0);
            grid.RowSpacing=stacked&&hasAction?12:0;
            grid.ColumnDefinitions[1].Width=stacked||!hasAction?new(0):compact?GridLength.Auto:new(actionWidth);
            Grid.SetColumnSpan(copy,stacked||!hasAction?2:1);Grid.SetRow(action,stacked?1:0);
            Grid.SetColumn(action,stacked?0:1);Grid.SetColumnSpan(action,stacked?2:1);
            action.MaxWidth=expanded?double.PositiveInfinity:actionWidth;
            action.Width=hasAction&&!expanded&&!compact&&ActualWidth>0?Math.Min(actionWidth,Math.Max(0,ActualWidth-34)):double.NaN;
            action.HorizontalAlignment=expanded?HorizontalAlignment.Stretch:HorizontalAlignment.Right;
            action.Visibility=hasAction?Visibility.Visible:Visibility.Collapsed;
        }
        Content=new Border {Style=(Style)Application.Current.Resources["CapSettingsCard"],Child=grid};
        SizeChanged+=(_,_)=>Arrange();Arrange();
    }
}
