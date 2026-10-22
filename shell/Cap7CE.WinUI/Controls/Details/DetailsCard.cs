using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Text;
namespace Cap7CE.WinUI.Controls;
internal sealed class DetailsCard : UserControl
{
    internal StackPanel Body {get;}=new(){Spacing=8};
    public DetailsCard(string title)
    {
        HorizontalContentAlignment=HorizontalAlignment.Stretch;
        Content=new Border{Style=(Style)Application.Current.Resources["CapDetailsCard"],Child=Body};
        Body.Children.Add(new TextBlock{Text=title,FontWeight=FontWeights.SemiBold,TextWrapping=TextWrapping.Wrap,IsTextSelectionEnabled=true});
    }
    public void Field(string label,string value,bool fullWidth=false,Action? open=null)
    {
        var heading=Ui.Text(label,true);heading.FontSize=12;
        var text=Ui.Text(value);text.IsTextSelectionEnabled=open is null;
        FrameworkElement content=text;
        if(open is not null) {
            var link=new Button{Content=text,Style=(Style)Application.Current.Resources["CapDetailsPath"]};
            ToolTipService.SetToolTip(link,"在资源管理器中显示");link.Click+=(_,_)=>open();content=link;
        }
        if(fullWidth){Body.Children.Add(Ui.Column(heading,content));return;}
        var row=new Grid {ColumnSpacing=8};row.ColumnDefinitions.Add(new(){Width=new(76)});row.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});
        heading.VerticalAlignment=VerticalAlignment.Center;row.Children.Add(heading);Grid.SetColumn(content,1);row.Children.Add(content);Body.Children.Add(row);
    }
    internal static string Bytes(decimal? value)
    {
        if(value is null)return "—";
        var amount=value.Value;var units=new[]{"B","KB","MB","GB","TB"};var unit=0;
        while(amount>=1024&&unit<units.Length-1){amount/=1024;unit++;}
        return unit==0?$"{amount:0} B":$"{amount:0.##} {units[unit]}";
    }
}
