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
        control=control switch {
            IndexMaintenanceView index=>new SettingsExpandable(index.Options,index),
            MetadataMaintenanceView metadata=>new SettingsExpandable(metadata.Options,metadata,metadata.Details),
            _=>control
        };
        var section=control as SettingsSection;
        if(section is not null){control=section.Actions;expanded=false;}
        var label=localized?Localization.LanguageUi.Text(title):Ui.Text(title);label.FontWeight=FontWeights.SemiBold;
        var text=Ui.Column(label,localized?Localization.LanguageUi.Text(description,true):Ui.Text(description,true));text.Spacing=3;
        label.Style=(Style)Application.Current.Resources["CapSettingsLabel"];
        if(text.Children[1] is TextBlock descriptionText){descriptionText.Style=(Style)Application.Current.Resources["CapSettingsDescription"];descriptionText.Visibility=string.IsNullOrWhiteSpace(description)?Visibility.Collapsed:Visibility.Visible;}
        var copy=new Grid{ColumnSpacing=16};copy.ColumnDefinitions.Add(new(){Width=new(20)});copy.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        var icon=new FontIcon{FontSize=16,Glyph=title switch{"settings.language"=>"\uE774","settings.launchAtLogin"=>"\uE7E8","settings.systemNotifications"=>"\uE7F4","settings.quickActions"=>"\uE765","settings.quickCommands"=>"\uE756","stableSettings.diagnostics"=>"\uE9D9",_=>"\uE713"},VerticalAlignment=VerticalAlignment.Center,IsHitTestVisible=false};AutomationProperties.SetAccessibilityView(icon,Microsoft.UI.Xaml.Automation.Peers.AccessibilityView.Raw);
        copy.Children.Add(icon);Grid.SetColumn(text,1);copy.Children.Add(text);
        if(control is SettingsExpandable expandable){
            var header=new Grid {ColumnSpacing=20,RowSpacing=0};
            header.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});header.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
            header.RowDefinitions.Add(new(){Height=GridLength.Auto});header.RowDefinitions.Add(new(){Height=GridLength.Auto});header.RowDefinitions.Add(new(){Height=GridLength.Auto});
            header.Children.Add(copy);
            if(expandable.Summary is FrameworkElement summary){
                summary.VerticalAlignment=VerticalAlignment.Center;summary.MaxWidth=220;
                Grid.SetColumn(summary,1);header.Children.Add(summary);
                header.SizeChanged+=(_,_)=>{
                    var narrow=header.ActualWidth<500;Grid.SetRow(summary,narrow?1:0);Grid.SetColumn(summary,narrow?0:1);
                    Grid.SetColumnSpan(summary,narrow?2:1);Grid.SetColumnSpan(copy,narrow?2:1);
                    summary.HorizontalAlignment=narrow?HorizontalAlignment.Left:HorizontalAlignment.Right;
                };
            }
            if(expandable.Details is FrameworkElement details){details.Margin=new(36,0,0,0);Grid.SetRow(details,2);Grid.SetColumnSpan(details,2);header.Children.Add(details);}
            var expander=new Expander{Header=header,Content=expandable.Body,IsExpanded=false,Style=(Style)Application.Current.Resources["CapSettingsExpander"]};
            if(localized)Localization.LanguageUi.Bind(expander,AutomationProperties.NameProperty,title);else AutomationProperties.SetName(expander,title);
            Content=expander;return;
        }
        if(control is SettingsPageLink link){
            var header=new Grid{ColumnSpacing=16};header.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});header.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
            var arrow=(UIElement)link.Content;link.Content=null;header.Children.Add(copy);Grid.SetColumn((FrameworkElement)arrow,1);header.Children.Add(arrow);
            link.Style=(Style)Application.Current.Resources["CapSettingsNavigationCard"];link.Content=header;
            if(localized)Localization.LanguageUi.Bind(link,AutomationProperties.NameProperty,title);Content=link;return;
        }
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
                if(child is TextBlock childText)childText.TextAlignment=TextAlignment.Right;
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
            var stacked=expanded||ActualWidth<(compact?520:640);
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
