using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;

namespace Cap7CE.WinUI.Controls;
internal sealed class AdvancedFilterPanel : UserControl
{
    private readonly Func<BrowseFilter> read;
    private readonly Action<BrowseFilter> apply;
    private readonly FilterFlyouts flyouts;
    private readonly Dictionary<string,int> versions=[];
    private readonly List<(AdvancedFilterGroup Group,FilterSection Section,List<(ToggleButton Button,AdvancedFilterOption Option)> Buttons)> sections=[];
    public AdvancedFilterPanel(string domain,Func<BrowseFilter> read,Action<BrowseFilter> apply,FilterFlyouts flyouts)
    {
        this.read=read;this.apply=apply;this.flyouts=flyouts;
        var row=new StackPanel {Orientation=Orientation.Horizontal,Spacing=6};
        foreach(var group in AdvancedFilterRules.Groups.Where(g=>g.Kind==domain||domain=="image-dimensions"&&g.Id=="artboards")) {
            if(!versions.ContainsKey(group.Kind))versions.Add(group.Kind,FormatRegistry.ExtractorVersion(group.Kind));
            var buttons=new List<(ToggleButton,AdvancedFilterOption)>();
            var tall=group.Id is "archive-structure" or "three-d-structure";
            foreach(var option in group.Options) {
                var icon=group.Id is "archive-content" or "archive-structure" or "three-d-structure"?FilterIcons.Create(option.Id=="image"?"visual":option.Id):null;
                var button=FilterSection.Option(option.Label,()=>Set(AdvancedFilterRules.Toggle(Current(group),group,option)),icon);buttons.Add((button,option));
                if(tall&&icon is not null) {
                    ((StackPanel)button.Content).Children.Clear();((FrameworkElement)icon).Width=((FrameworkElement)icon).Height=24;
                    button.Content=Ui.Column(icon,new TextBlock {Text=option.Label,FontSize=11,HorizontalAlignment=HorizontalAlignment.Center});
                    ((StackPanel)button.Content).Spacing=2;button.Height=56;
                }
            }
            var section=new FilterSection(group.Title,FilterSection.Options(buttons.Select(pair=>(UIElement)pair.Item1).ToArray(),group.Options.Length>6?4:3,tall?56:26),
                group.Range.Length>0?anchor=>Edit(anchor,group):null);
            row.Children.Add(section);sections.Add((group,section,buttons));
        }
        Content=row;
    }
    private CoreSearchFactFilter Current(AdvancedFilterGroup group)=>read().Facts is {} facts&&facts.Kind==group.Kind?facts:new(group.Kind,versions[group.Kind]);
    private void Set(CoreSearchFactFilter? facts)=>apply(read() with {Facts=facts});
    public void Restore()
    {
        foreach(var (group,section,buttons) in sections) {
            var visible=AdvancedFilterRules.Available(group,read());section.Visibility=visible?Visibility.Visible:Visibility.Collapsed;
            if(!visible)continue;var facts=Current(group);
            foreach(var (button,option) in buttons)button.IsChecked=AdvancedFilterRules.Selected(facts,group,option);
            section.Summary.Text=AdvancedFilterRules.Has(facts,group)&&!buttons.Any(pair=>pair.Button.IsChecked==true)?"自定":"";
        }
    }
    public void SetAvailability(FilterAvailability state)
    {foreach(var (group,section,_) in sections)section.IsEnabled=state.Enabled(group.Kind);}
    private void Edit(Button anchor,AdvancedFilterGroup group)
    {
        var (lower,upper,count)=AdvancedFilterRules.Bounds(Current(group),group);
        NumberBox Number(string header,long? value)=>new(){Header=header,Minimum=group.Minimum,Maximum=group.Maximum,Value=value??double.NaN,Width=240,SpinButtonPlacementMode=NumberBoxSpinButtonPlacementMode.Compact};
        var min=Number("最小值",lower);var max=Number("最大值",upper);var error=Ui.Text("",true);var content=Ui.Column(min,max,error);
        if(count>1)content.Children.Insert(0,Ui.Text("应用后本组改为单一范围",true));
        content.Children.Add(Ui.Row(Ui.Button("清除此组",()=>{Set(AdvancedFilterRules.Clear(Current(group),group));flyouts.Close();}),Ui.Button("应用",()=>{
            if(new[]{min,max}.Any(box=>!double.IsNaN(box.Value)&&(!double.IsFinite(box.Value)||box.Value!=Math.Truncate(box.Value)||box.Value<group.Minimum||box.Value>group.Maximum))) {error.Text="请输入范围内的整数";return;}
            if(min.Value>max.Value){error.Text="最大值不能小于最小值";return;}
            Set(AdvancedFilterRules.ApplyRange(Current(group),group,double.IsNaN(min.Value)?null:(long)min.Value,double.IsNaN(max.Value)?null:(long)max.Value));flyouts.Close();
        })));
        flyouts.Show(anchor,content);
    }
}
