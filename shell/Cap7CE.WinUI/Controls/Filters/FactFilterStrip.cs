using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;

namespace Cap7CE.WinUI.Controls;
internal sealed class FactFilterStrip : UserControl
{
    private readonly Func<BrowseFilter> read;
    private readonly Action<BrowseFilter> apply;
    private readonly FactFilterEditor editor;
    private readonly AspectFilterEditor aspectEditor;
    private readonly FilterFlyouts flyouts;
    private ColorFilterSection? colors;
    private AdvancedFilterPanel? advanced;
    private ThreeDTypeSection? threeD;
    private TextBlock? dimensionSummary;
    private readonly StackPanel row=new() {Orientation=Orientation.Horizontal,Spacing=6};
    private readonly List<(ToggleButton Button,Func<CoreSearchFactFilter,bool> Selected)> options=[];
    private readonly List<(FilterSection Section,IReadOnlyList<UIElement> Buttons,string Scope)> sections=[];
    private string domain="?";
    private int extractorVersion;
    private FilterAvailability availability=FilterAvailability.Empty;
    public FactFilterStrip(Func<BrowseFilter> read,Action<BrowseFilter> apply,FilterFlyouts flyouts)
    {this.read=read;this.apply=apply;this.flyouts=flyouts;editor=new(read,apply,flyouts);aspectEditor=new(()=>Current,value=>Change(_=>value),flyouts);Content=row;}
    private CoreSearchFactFilter Current => read().Facts is {} facts&&facts.Kind==domain?facts:new(domain,extractorVersion);
    public void Restore()
    {
        var next=FilterPresets.Domain(read());
        if(next!=domain){domain=next;if(domain.Length>0)extractorVersion=FormatRegistry.ExtractorVersion(domain);Build();}
        if(domain.Length==0)return;
        foreach(var (button,selected) in options)button.IsChecked=selected(Current);
        colors?.Restore();advanced?.Restore();threeD?.Restore();
        if(dimensionSummary is not null)dimensionSummary.Text=MediaFilterRules.DimensionLabel(Current);
        foreach(var (section,buttons,scope) in sections)section.Summary.Text=FilterFactRules.Has(Current,scope)&&!buttons.OfType<ToggleButton>().Any(b=>b.IsChecked==true)?"自定":"";
        ApplyAvailability();
    }
    public void SetAvailability(FilterAvailability value){availability=value;ApplyAvailability();}
    private void ApplyAvailability()
    {
        foreach(var (section,_,_) in sections)section.IsEnabled=availability.Enabled(domain);
        if(colors is not null)colors.IsEnabled=availability.Enabled(domain,true);
        advanced?.SetAvailability(availability);
    }
    private void Change(Func<CoreSearchFactFilter,CoreSearchFactFilter> update)=>apply(read() with {Facts=AspectFilterRules.Normalize(update(Current))});
    private ToggleButton Option(string label,Func<CoreSearchFactFilter,bool> selected,Func<CoreSearchFactFilter,bool,CoreSearchFactFilter> update)
    {
        var button=FilterSection.Option(label,()=>Change(value=>update(value,!selected(value))));options.Add((button,selected));return button;
    }
    private ToggleButton MediaOption(MediaFilterOption option,string scope)=>Option(option.Label,f=>MediaFilterRules.Selected(f,option,scope),(f,_)=>MediaFilterRules.Toggle(f,option,scope));
    private static void Tall(ToggleButton button,string label,string iconId)
    {
        var icon=FilterIcons.Create(iconId);icon.Width=icon.Height=24;FilterIcons.BindSelection(icon,button);
        button.Content=Ui.Column(icon,new TextBlock {Text=label,FontSize=11,HorizontalAlignment=HorizontalAlignment.Center});
        ((StackPanel)button.Content).Spacing=2;button.Height=56;button.Padding=new(2,0,2,0);
    }
    private void Group(string title,IReadOnlyList<UIElement> buttons,int columns,bool tall=false,string scope="all",Action<Button>? edit=null,bool editable=true)
    {
        var section=new FilterSection(title,FilterSection.Options(buttons,columns,tall?56:26),editable?edit??(anchor=>editor.Show(anchor,domain,scope)):null);
        row.Children.Add(section);sections.Add((section,buttons,scope=="all"?domain:scope));
    }
    private void Build()
    {
        row.Children.Clear();options.Clear();sections.Clear();colors=null;advanced=null;threeD=null;dimensionSummary=null;if(domain.Length==0)return;
        if(domain=="image-dimensions"){advanced=new(domain,read,apply,flyouts);row.Children.Add(advanced);}
        if(domain is "image-dimensions" or "video") {
            colors=new(domain,()=>Current,value=>Change(_=>value),flyouts);row.Children.Add(colors);
            var ratios=MediaFilterRules.Options(domain+"-aspect").Select(choice=>{
                var button=MediaOption(choice,"aspect");Tall(button,choice.Label,choice.Label);return (UIElement)button;
            }).ToArray();
            Group("比例",ratios,5,true,scope:"aspect",edit:aspectEditor.Show);
            if(domain=="video")Group("分辨率",MediaFilterRules.Options("video-resolution").Select(choice=>(UIElement)MediaOption(choice,"resolution")).ToArray(),3,scope:"dimensions");
            else {
                dimensionSummary=new TextBlock {FontSize=11,HorizontalAlignment=HorizontalAlignment.Center};
                var icon=FilterIcons.Create("dimensions");icon.Width=icon.Height=24;
                Button dimensions=null!;dimensions=FilterSection.ActionButton("",()=>editor.Show(dimensions,domain,"dimensions"));
                dimensions.Content=Ui.Column(icon,dimensionSummary);((StackPanel)dimensions.Content).Spacing=2;dimensions.Height=56;dimensions.MinWidth=110;
                Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(dimensions,"编辑图像尺寸");
                Group("尺寸",[dimensions],1,true,scope:"dimensions");
            }
        }
        if(domain=="image-dimensions")Group("动静",new UIElement[] {
            Option("动态图",f=>f.IsAnimated==true,(f,on)=>f with {IsAnimated=on?true:null}),
            Option("静态图",f=>f.IsAnimated==false,(f,on)=>f with {IsAnimated=on?false:null})},1,editable:false);
        if(domain is "video" or "audio")Group("时长",MediaFilterRules.Options(domain+"-duration").Select(choice=>(UIElement)MediaOption(choice,"duration")).ToArray(),2,scope:"duration");
        if(domain=="audio") {
            var channels=MediaFilterRules.Options("audio-channels").Select(choice=>{
                var button=MediaOption(choice,"channels");Tall(button,choice.Label,choice.Id);return (UIElement)button;
            }).ToArray();Group("声道",channels,3,true,scope:"channels");
        }
        if(domain=="three-d"){threeD=new(read,apply);row.Children.Add(threeD);}
        if(domain is "document" or "three-d" or "model" or "text-data" or "archive" or "font") {advanced=new(domain,read,apply,flyouts);row.Children.Add(advanced);}
    }
}
