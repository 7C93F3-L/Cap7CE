using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Localization;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Models;
using Cap7CE.WinUI.Themes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;

namespace Cap7CE.WinUI.Controls;
internal sealed class ColorFilterSection : UserControl
{
    private readonly Func<CoreSearchFactFilter> read;
    private readonly Dictionary<string,ToggleButton> buttons=[];
    private readonly FilterSection section;
    private static readonly (string Id,string Color)[] swatches=[
        ("red","#F22228"),("orange","#FF931F"),("yellow","#FFEA18"),("green","#27D345"),
        ("cyan","#17CED7"),("blue","#243BDF"),("purple","#A32BD3"),("pink","#EF68AE"),
        ("black-background","#111111"),("gray-tone","#999999"),("white-background","#F3F3F3"),
        ("transparent-background","#FFFFFF"),("bright-image","#FFF1AD"),("dark-image","#303947"),
        ("vivid-image","#F22228"),("muted-image","#BA8B92")];
    public ColorFilterSection(string domain,Func<CoreSearchFactFilter> read,Action<CoreSearchFactFilter> apply)
    {
        this.read=read;var grid=new Grid {ColumnSpacing=1,RowSpacing=4};
        for(var i=0;i<8;i++)grid.ColumnDefinitions.Add(new(){Width=new(22)});
        grid.RowDefinitions.Add(new(){Height=new(26)});grid.RowDefinitions.Add(new(){Height=new(26)});
        var index=0;
        foreach(var (id,color) in swatches) {
            var definition=VisualFilterRules.Definitions.First(d=>d.Id==id);
            if(domain=="video" && (!definition.Video || definition.Trait))continue;
            var button=new ToggleButton {Style=(Style)Application.Current.Resources["CapFilterSwatch"],Content=Swatch(id,color)};
            L.Label(button,FactTextKeys.Color(id));button.Click+=(_,_)=>apply(VisualFilterRules.Toggle(read(),id));
            Grid.SetColumn(button,index%8);Grid.SetRow(button,index/8);grid.Children.Add(button);buttons.Add(id,button);index++;
        }
        section=new(domain=="video"?"ui.facts.videoColor":"ui.facts.imageColor",grid,localized:true);
        L.Bind(section,ToolTipService.ToolTipProperty,"ui.facts.colorAvailable");Content=section;
    }
    public void Restore()
    {
        foreach(var (id,button) in buttons)button.IsChecked=VisualFilterRules.Selected(read(),id);
        if(read().VisualGroups is {Count:>0})L.Bind(section.Summary,TextBlock.TextProperty,"ui.facts.selected");else L.Literal(section.Summary,TextBlock.TextProperty,"");
    }
    private static UIElement Swatch(string id,string color)
    {
        if(id=="transparent-background") {
            var grid=new Grid {Width=16,Height=16};
            for(var i=0;i<4;i++){grid.ColumnDefinitions.Add(new(){Width=new(4)});grid.RowDefinitions.Add(new(){Height=new(4)});}
            for(var y=0;y<4;y++)for(var x=0;x<4;x++) {
                var square=new Border {Background=new SolidColorBrush(ThemeService.Parse((x+y)%2==0?"#FFFFFF":"#BBBBBB"))};
                Grid.SetColumn(square,x);Grid.SetRow(square,y);grid.Children.Add(square);
            }
            return new Border {CornerRadius=new(8),Child=grid};
        }
        Brush brush=new SolidColorBrush(ThemeService.Parse(color));
        if(id.EndsWith("-image")) {
            var colors=id switch {"bright-image"=>new[]{"#FFFFFF","#FFF1AD","#BAdCF3"},"dark-image"=>["#737C89","#303947","#10151E"],
                "vivid-image"=>["#F22228","#FFEA18","#27D345","#243BDF","#A32BD3"],_=>["#BA8B92","#B8B18D","#8DB593","#9399B9","#AE95B5"]};
            var gradient=new LinearGradientBrush {StartPoint=new(0,0),EndPoint=new(1,1)};
            for(var i=0;i<colors.Length;i++)gradient.GradientStops.Add(new(){Color=ThemeService.Parse(colors[i]),Offset=i/(double)(colors.Length-1)});brush=gradient;
        }
        return new Ellipse {Width=16,Height=16,Fill=brush};
    }
}
