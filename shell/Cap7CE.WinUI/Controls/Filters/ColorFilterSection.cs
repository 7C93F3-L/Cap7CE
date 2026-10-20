using Cap7CE.Core.Protocol;
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
    private readonly Action<CoreSearchFactFilter> apply;
    private readonly Dictionary<string,ToggleButton> buttons=[];
    private readonly FilterSection section;
    private readonly FilterFlyouts flyouts;
    private static readonly (string Id,string Label,string Color)[] swatches=[
        ("red","红色","#F22228"),("orange","橙色","#FF931F"),("yellow","黄色","#FFEA18"),("green","绿色","#27D345"),
        ("cyan","青色","#17CED7"),("blue","蓝色","#243BDF"),("purple","紫色","#A32BD3"),("pink","粉色","#EF68AE"),
        ("black-background","黑底","#111111"),("gray-tone","灰色调","#999999"),("white-background","白底","#F3F3F3"),
        ("transparent-background","透明背景","#FFFFFF"),("bright-image","明亮","#FFF1AD"),("dark-image","偏暗","#303947"),
        ("vivid-image","鲜艳","#F22228"),("muted-image","低饱和","#BA8B92")];
    public ColorFilterSection(string domain,Func<CoreSearchFactFilter> read,Action<CoreSearchFactFilter> apply,FilterFlyouts flyouts)
    {
        this.read=read;this.apply=apply;this.flyouts=flyouts;var grid=new Grid {ColumnSpacing=1,RowSpacing=4};
        for(var i=0;i<8;i++)grid.ColumnDefinitions.Add(new(){Width=new(22)});
        grid.RowDefinitions.Add(new(){Height=new(26)});grid.RowDefinitions.Add(new(){Height=new(26)});
        var index=0;
        foreach(var (id,label,color) in swatches) {
            var definition=VisualFilterRules.Definitions.First(d=>d.Id==id);
            if(domain=="video" && (!definition.Video || definition.Trait))continue;
            var button=new ToggleButton {Style=(Style)Application.Current.Resources["CapFilterSwatch"],Content=Swatch(id,color)};
            ToolTipService.SetToolTip(button,label);AutomationProperties.SetName(button,label);button.Click+=(_,_)=>apply(VisualFilterRules.Toggle(read(),id));
            Grid.SetColumn(button,index%8);Grid.SetRow(button,index/8);grid.Children.Add(button);buttons.Add(id,button);index++;
        }
        section=new(domain=="video"?"视频颜色":"图像颜色",grid,Edit);
        ToolTipService.SetToolTip(section,"仅筛选已有颜色信息的文件");Content=section;
    }
    public void Restore()
    {
        foreach(var (id,button) in buttons)button.IsChecked=VisualFilterRules.Selected(read(),id);
        section.Summary.Text=read().VisualGroups is {Count:>0}?"已选":"";
    }
    private void Edit(Button anchor)
    {
        var selected=VisualFilterRules.Definitions.Where(d=>VisualFilterRules.Selected(read(),d.Id)).Select(d=>d.Id).ToHashSet();
        var controls=new List<UIElement>();
        foreach(var (id,label,_) in swatches.Where(s=>VisualFilterRules.Definitions.First(d=>d.Id==s.Id).Trait)) {
            var button=FilterSection.Option(label,()=>{if(!selected.Add(id))selected.Remove(id);});button.IsChecked=selected.Contains(id);controls.Add(button);
        }
        var content=Ui.Column(new TextBlock {Text="颜色特征",FontSize=14},FilterSection.Options(controls,2));
        content.Children.Add(Ui.Row(Ui.Button("清除颜色",()=>{apply(read() with {VisualGroups=null});flyouts.Close();}),Ui.Button("应用",()=>{apply(VisualFilterRules.Apply(read(),selected));flyouts.Close();})));
        flyouts.Show(anchor,content);
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
