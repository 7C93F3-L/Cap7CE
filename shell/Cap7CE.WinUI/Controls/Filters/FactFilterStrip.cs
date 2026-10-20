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
    private readonly StackPanel row=new() {Orientation=Orientation.Horizontal,Spacing=6};
    private readonly List<(ToggleButton Button,Func<CoreSearchFactFilter,bool> Selected)> options=[];
    private readonly List<(FilterSection Section,IReadOnlyList<UIElement> Buttons,string Scope)> sections=[];
    private string domain="?";
    private int extractorVersion;
    public FactFilterStrip(Func<BrowseFilter> read,Action<BrowseFilter> apply,FilterFlyouts flyouts)
    {this.read=read;this.apply=apply;this.flyouts=flyouts;editor=new(read,apply,flyouts);aspectEditor=new(()=>Current,value=>Change(_=>value),flyouts);Content=row;}
    private CoreSearchFactFilter Current => read().Facts??new(domain,extractorVersion);
    public void Restore()
    {
        var next=FilterPresets.Domain(read());
        if(next!=domain){domain=next;if(domain.Length>0)extractorVersion=FormatRegistry.ExtractorVersion(domain);Build();}
        if(domain.Length==0)return;
        foreach(var (button,selected) in options)button.IsChecked=selected(Current);
        colors?.Restore();
        foreach(var (section,buttons,scope) in sections)section.Summary.Text=FilterFactRules.Has(Current,scope)&&!buttons.OfType<ToggleButton>().Any(b=>b.IsChecked==true)?"自定":"";
    }
    private void Change(Func<CoreSearchFactFilter,CoreSearchFactFilter> update)
    {
        apply(read() with {Facts=AspectFilterRules.Normalize(update(Current))});
    }
    private ToggleButton Option(string label,Func<CoreSearchFactFilter,bool> selected,Func<CoreSearchFactFilter,bool,CoreSearchFactFilter> update)
    {
        var button=FilterSection.Option(label,()=>Change(value=>update(value,!selected(value))));options.Add((button,selected));return button;
    }
    private void Group(string title,IReadOnlyList<UIElement> buttons,int columns,bool tall=false,string scope="all",Action<Button>? edit=null,bool editable=true)
    {
        var section=new FilterSection(title,FilterSection.Options(buttons,columns,tall?56:26),editable?edit??(anchor=>editor.Show(anchor,domain,scope)):null);
        row.Children.Add(section);sections.Add((section,buttons,scope=="all"?domain:scope));
    }
    private void Build()
    {
        row.Children.Clear();options.Clear();sections.Clear();colors=null;if(domain.Length==0)return;
        if(domain is "image-dimensions" or "video") {
            colors=new(domain,()=>Current,value=>Change(_=>value),flyouts);row.Children.Add(colors);
            (string Label,CoreSearchAspectRange Range)[] ratios=[
                ("竖图",new(new(1,2),new(9,10),false,false)),("横图",new(new(11,10),new(2,1),false,false)),
                ("方形",new(new(9,10),new(11,10))),("宽图",new(new(2,1))),("长图",new(Maximum:new(1,2)))];
            var ratioButtons=ratios.Select(choice=>Option(choice.Label,f=>f.AspectRanges?.Contains(choice.Range)==true,(f,on)=>{
                var ranges=(f.AspectRanges??[]).ToList();if(on)ranges.Add(choice.Range);else ranges.Remove(choice.Range);
                return f with {AspectRanges=ranges.Count>0?ranges:null,MinimumAspectRatio=null,MaximumAspectRatio=null};
            })).ToArray();
            foreach(var button in ratioButtons) {
                var label=(string)button.Content;var icon=FilterIcons.Create(label);icon.Width=icon.Height=24;
                FilterIcons.BindSelection(icon,button);
                button.Content=Ui.Column(icon,new TextBlock {Text=label,FontSize=11,HorizontalAlignment=HorizontalAlignment.Center});
                ((StackPanel)button.Content).Spacing=2;button.Height=56;button.Padding=new(2,0,2,0);
            }
            Group("比例",ratioButtons,5,true,scope:"aspect",edit:aspectEditor.Show);
            Group("尺寸",new UIElement[] {
                Option("短边 ≥1K",f=>f.MinimumWidth==1024&&f.MinimumHeight==1024,(f,on)=>f with {MinimumWidth=on?1024:null,MinimumHeight=on?1024:null,MaximumWidth=null,MaximumHeight=null}),
                Option("短边 ≥2K",f=>f.MinimumWidth==2048&&f.MinimumHeight==2048,(f,on)=>f with {MinimumWidth=on?2048:null,MinimumHeight=on?2048:null,MaximumWidth=null,MaximumHeight=null}),
                Option("短边 ≥4K",f=>f.MinimumWidth==4096&&f.MinimumHeight==4096,(f,on)=>f with {MinimumWidth=on?4096:null,MinimumHeight=on?4096:null,MaximumWidth=null,MaximumHeight=null})},2,scope:"dimensions");
        }
        if(domain=="image-dimensions")Group("动静",new UIElement[] {
            Option("动态图",f=>f.IsAnimated==true,(f,on)=>f with {IsAnimated=on?true:null}),
            Option("静态图",f=>f.IsAnimated==false,(f,on)=>f with {IsAnimated=on?false:null})},1,editable:false);
        if(domain is "video" or "audio") {
            (string Label,long? Min,long? Max)[] durations=[("＜15秒",null,14999),("15秒–1分",15000,59999),("1–5分",60000,299999),("≥5分",300000,null)];
            Group("时长",durations.Select(choice=>(UIElement)Option(choice.Label,f=>f.MinimumDurationMilliseconds==choice.Min&&f.MaximumDurationMilliseconds==choice.Max,
                (f,on)=>f with {MinimumDurationMilliseconds=on?choice.Min:null,MaximumDurationMilliseconds=on?choice.Max:null})).ToArray(),2,scope:"duration");
        }
        if(domain=="audio") {
            (string Label,CoreSearchIntegerRange Range)[] channels=[("单声道",new(1,1)),("立体声",new(2,2)),("多声道",new(3))];
            Group("声道",channels.Select(choice=>(UIElement)Option(choice.Label,f=>f.ChannelRanges?.Contains(choice.Range)==true,
                (f,on)=>f with {ChannelRanges=on?[choice.Range]:null})).ToArray(),2,scope:"channels");
        }
        if(domain=="font")Group("字体",new UIElement[] {
            Option("中文",f=>f.Font?.SupportsChinese==true,(f,on)=>f with {Font=Clean((f.Font??new()) with {SupportsChinese=on?true:null})}),
            Option("拉丁",f=>f.Font?.SupportsLatin==true,(f,on)=>f with {Font=Clean((f.Font??new()) with {SupportsLatin=on?true:null})}),
            Option("可变",f=>f.Font?.Variable==true,(f,on)=>f with {Font=Clean((f.Font??new()) with {Variable=on?true:null})}),
            Option("斜体",f=>f.Font?.Italic==true,(f,on)=>f with {Font=Clean((f.Font??new()) with {Italic=on?true:null})})},2);
        if(domain is "document" or "three-d" or "model" or "text-data" or "archive") {
            var label=domain switch {"document"=>"页数", "three-d"=>"三角面", "model"=>"参数量", "text-data"=>"文本 / 数据",_=>"文件数量"};
            var configure=FilterSection.ActionButton("自定义…",()=>{});configure.Click+=(_,_)=>editor.Show(configure,domain);
            var clear=FilterSection.ActionButton("清除此组",()=>apply(read() with {Facts=null}));
            Group(label,[configure,clear],1);
        }
    }
    private static CoreSearchFontFilter? Clean(CoreSearchFontFilter value)=>value==new CoreSearchFontFilter()?null:value;
}
