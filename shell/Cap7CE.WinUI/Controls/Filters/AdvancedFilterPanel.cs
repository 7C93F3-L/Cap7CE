using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Localization;
using L=Cap7CE.WinUI.Localization.LanguageUi;
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
    private readonly List<(AdvancedFilterGroup Group,FilterSection Section,List<(ToggleButton Button,AdvancedFilterOption Option)> Buttons,MetadataFilterGate Gate)> sections=[];
    private FilterAvailability availability=FilterAvailability.Empty;
    public event Action<string,FilterAvailabilityState>? Unavailable;
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
                var button=FilterSection.Option(FactTextKeys.Option(group.Id,option.Id),()=>Set(AdvancedFilterRules.Toggle(Current(group),group,option)),icon,localized:true);buttons.Add((button,option));
                if(tall&&icon is not null) {
                    ((StackPanel)button.Content).Children.Clear();((FrameworkElement)icon).Width=((FrameworkElement)icon).Height=24;
                    var caption=L.Text(FactTextKeys.Option(group.Id,option.Id));caption.TextWrapping=TextWrapping.NoWrap;caption.FontSize=11;caption.HorizontalAlignment=HorizontalAlignment.Center;button.Content=Ui.Column(icon,caption);
                    ((StackPanel)button.Content).Spacing=2;button.Height=56;
                }
            }
            var section=new FilterSection(FactTextKeys.Group(group.Id),FilterSection.Options(buttons.Select(pair=>(UIElement)pair.Item1).ToArray(),group.Options.Length>6?4:3,tall?56:26),
                group.Range.Length>0?anchor=>Edit(anchor,group):null,localized:true);
            var gate=new MetadataFilterGate(section,()=>Unavailable?.Invoke(group.Kind,availability.Get(group.Kind)));
            row.Children.Add(gate);sections.Add((group,section,buttons,gate));
        }
        Content=row;
    }
    private CoreSearchFactFilter Current(AdvancedFilterGroup group)=>read().Facts is {} facts&&facts.Kind==group.Kind?facts:new(group.Kind,versions[group.Kind]);
    private void Set(CoreSearchFactFilter? facts)=>apply(read() with {Facts=facts});
    public void Restore()
    {
        foreach(var (group,section,buttons,gate) in sections) {
            var visible=AdvancedFilterRules.Available(group,read());gate.Visibility=section.Visibility=visible?Visibility.Visible:Visibility.Collapsed;
            if(!visible)continue;var facts=Current(group);
            foreach(var (button,option) in buttons)button.IsChecked=AdvancedFilterRules.Selected(facts,group,option);
            if(AdvancedFilterRules.Has(facts,group)&&!buttons.Any(pair=>pair.Button.IsChecked==true))L.Bind(section.Summary,TextBlock.TextProperty,"ui.filters.custom");else L.Literal(section.Summary,TextBlock.TextProperty,"");
        }
    }
    public void SetAvailability(FilterAvailability state)
    {availability=state;foreach(var (group,_,_,gate) in sections)gate.Set(state.Get(group.Kind));}
    private void Edit(Button anchor,AdvancedFilterGroup group)
    {
        var (lower,upper,count)=AdvancedFilterRules.Bounds(Current(group),group);
        NumberBox Number(string key,long? value){var box=new NumberBox{Minimum=group.Minimum,Maximum=group.Maximum,Value=value??double.NaN,Width=group.Maximum>2000000000?240:180,SpinButtonPlacementMode=NumberBoxSpinButtonPlacementMode.Compact};L.Bind(box,NumberBox.HeaderProperty,key);return box;}
        var min=Number("ui.filters.minimum",lower);var max=Number("ui.filters.maximum",upper);var error=Ui.Text("",true);var content=Ui.Column(min,max,error);
        if(count>1)content.Children.Insert(0,L.Text("ui.facts.mergeRange",true));
        content.Children.Add(Ui.Row(L.Button("ui.facts.clearGroup",()=>{Set(AdvancedFilterRules.Clear(Current(group),group));flyouts.Close();}),L.Button("common.apply",()=>{
            if(new[]{min,max}.Any(box=>!double.IsNaN(box.Value)&&(!double.IsFinite(box.Value)||box.Value!=Math.Truncate(box.Value)||box.Value<group.Minimum||box.Value>group.Maximum))) {L.Bind(error,TextBlock.TextProperty,"ui.facts.integerRange");return;}
            if(min.Value>max.Value){L.Bind(error,TextBlock.TextProperty,"ui.filters.invalidRange");return;}
            Set(AdvancedFilterRules.ApplyRange(Current(group),group,double.IsNaN(min.Value)?null:(long)min.Value,double.IsNaN(max.Value)?null:(long)max.Value));flyouts.Close();
        })));
        flyouts.Show(anchor,content);
    }
}
