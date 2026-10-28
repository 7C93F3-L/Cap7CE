using Microsoft.UI.Xaml;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace Cap7CE.WinUI.Controls;

internal sealed class KeywordChip:UserControl
{
    public KeywordChip(string word,Action remove)
    {
        var surface=new Border{Style=(Style)Application.Current.Resources["CapKeywordChip"]};
        var row=new Grid {ColumnSpacing=4};
        row.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});row.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        var label=new TextBlock{Text=word,FontSize=12,VerticalAlignment=VerticalAlignment.Center,TextTrimming=TextTrimming.CharacterEllipsis};
        var button=Ui.Tool("\uE711","",remove);L.Label(button,"ui.keywords.remove",()=>new Dictionary<string,object?>{{"word",word}});button.Width=button.Height=20;button.MinWidth=button.MinHeight=0;button.Padding=new(0);
        ((FontIcon)button.Content).FontSize=10;
        var region=new Grid{Width=22,Background=new SolidColorBrush(Microsoft.UI.Colors.Transparent)};region.Children.Add(button);
        HoverReveal.Attach(region,button);Grid.SetColumn(region,1);row.Children.Add(label);row.Children.Add(region);surface.Child=row;Content=surface;
        ToolTipService.SetToolTip(this,word);
    }
}
