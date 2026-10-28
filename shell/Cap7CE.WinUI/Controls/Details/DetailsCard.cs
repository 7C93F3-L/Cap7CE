using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Text;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Localization;
namespace Cap7CE.WinUI.Controls;
internal sealed class DetailsCard : UserControl
{
    internal StackPanel Body {get;}=new(){Spacing=8};
    public DetailsCard(UiMessage title):this("")
        =>L.Message((TextBlock)Body.Children[0],TextBlock.TextProperty,title);
    public DetailsCard(string title,bool localized=false,Func<IReadOnlyDictionary<string,object?>?>? parameters=null)
    {
        HorizontalContentAlignment=HorizontalAlignment.Stretch;
        Content=new Border{Style=(Style)Application.Current.Resources["CapDetailsCard"],Child=Body};
        var heading=localized?L.Text(title,parameters:parameters):Ui.Text(title);heading.FontWeight=FontWeights.SemiBold;heading.IsTextSelectionEnabled=true;Body.Children.Add(heading);
    }
    public TextBlock Field(string label,string value,bool fullWidth=false,Action? open=null)
    {
        var heading=L.Text(label,true);heading.FontSize=12;
        var text=Ui.Text(value);text.IsTextSelectionEnabled=open is null;
        FrameworkElement content=text;
        if(open is not null) {
            var link=new Button{Content=text,Style=(Style)Application.Current.Resources["CapDetailsPath"]};
            L.Bind(link,ToolTipService.ToolTipProperty,"ui.details.reveal");link.Click+=(_,_)=>open();content=link;
        }
        if(fullWidth){Body.Children.Add(Ui.Column(heading,content));return text;}
        var row=new Grid {ColumnSpacing=8};row.ColumnDefinitions.Add(new(){Width=new(76)});row.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        heading.VerticalAlignment=VerticalAlignment.Center;row.Children.Add(heading);Grid.SetColumn(content,1);row.Children.Add(content);Body.Children.Add(row);return text;
    }
    public void FieldResource(string labelKey,string valueKey,Func<IReadOnlyDictionary<string,object?>?>? parameters=null,bool fullWidth=false)
    {var text=Field(labelKey,"",fullWidth);L.Bind(text,TextBlock.TextProperty,valueKey,parameters);}
    internal static string Bytes(decimal? value)
    {
        if(value is null)return "—";
        var amount=value.Value;var units=new[]{"B","KB","MB","GB","TB"};var unit=0;
        while(amount>=1024&&unit<units.Length-1){amount/=1024;unit++;}
        return unit==0?$"{amount:0} B":$"{amount:0.##} {units[unit]}";
    }
}
