using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Media;

namespace Cap7CE.WinUI.Controls;

internal sealed class FilterSection : UserControl
{
    public TextBlock Summary { get; } = new() { FontSize=11, VerticalAlignment=VerticalAlignment.Center, TextTrimming=TextTrimming.CharacterEllipsis, MaxWidth=150 };
    public FilterSection(string title,UIElement body,Action<Button>? edit=null,bool separator=true)
    {
        Height=80;
        var border=new Border {Padding=new(6,0,8,0),Background=new SolidColorBrush(Microsoft.UI.Colors.Transparent),Style=(Style)Application.Current.Resources["CapFilterGroupFrame"]};
        if(separator)border.BorderThickness=new(0,0,1,0);
        var heading=new StackPanel {Orientation=Orientation.Horizontal,Spacing=4,Height=24};
        heading.Children.Add(new TextBlock {Text=title,FontSize=12,FontWeight=Microsoft.UI.Text.FontWeights.SemiBold,VerticalAlignment=VerticalAlignment.Center});
        if(edit is not null) {
            var button=ActionButton("",()=>{}); button.Width=22;button.Height=22;button.Padding=new(3);
            button.Content=new FontIcon {Glyph="\uE70F",FontSize=11};
            AutomationProperties.SetName(button,"编辑"+title);ToolTipService.SetToolTip(button,"编辑"+title);button.Click+=(_,_)=>edit(button);heading.Children.Add(button);
            HoverReveal.Attach(this,button);
        }
        Summary.Style=(Style)Application.Current.Resources["CapFilterSummary"];heading.Children.Add(Summary);
        var panel=new Grid();panel.RowDefinitions.Add(new(){Height=new(24)});panel.RowDefinitions.Add(new(){Height=new(56)});
        panel.Children.Add(heading);Grid.SetRow((FrameworkElement)body,1);panel.Children.Add(body);border.Child=panel;Content=border;
    }
    public static ToggleButton Option(string label,Action action,UIElement? icon=null)
    {
        var button=new ToggleButton {Content=label,Style=(Style)Application.Current.Resources["CapFilterOption"]};
        if(icon is not null) {var content=new StackPanel {Orientation=Orientation.Horizontal,Spacing=4};content.Children.Add(icon);content.Children.Add(new TextBlock {Text=label,FontSize=12});button.Content=content;}
        if(icon is SidebarIcon vector)FilterIcons.BindSelection(vector,button);
        AutomationProperties.SetName(button,label);button.Click+=(_,_)=>action();return button;
    }
    public static Button ActionButton(string label,Action action)
    {var button=new Button {Content=label,Style=(Style)Application.Current.Resources["CapFilterAction"]};button.Click+=(_,_)=>action();return button;}
    public static Grid Options(IReadOnlyList<UIElement> options,int columns,double rowHeight=26)
    {
        var grid=new Grid {ColumnSpacing=4,RowSpacing=4,VerticalAlignment=VerticalAlignment.Top};
        for(var i=0;i<columns;i++)grid.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        for(var i=0;i<(options.Count+columns-1)/columns;i++)grid.RowDefinitions.Add(new(){Height=new(rowHeight)});
        for(var i=0;i<options.Count;i++){Grid.SetColumn((FrameworkElement)options[i],i%columns);Grid.SetRow((FrameworkElement)options[i],i/columns);grid.Children.Add(options[i]);}return grid;
    }
}
