using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls;
internal sealed class FactFilterEditor(Func<BrowseFilter> read,Action<BrowseFilter> apply,FilterFlyouts flyouts)
{
    public void Show(Button anchor,string domain,string scope)
    {
        if(scope is not ("dimensions" or "duration" or "channels"))throw new ArgumentException("Unsupported numeric filter group",nameof(scope));
        var current=read().Facts is {} facts&&facts.Kind==domain?facts:new CoreSearchFactFilter(domain,FormatRegistry.ExtractorVersion(domain));
        var content=new StackPanel {Spacing=10,Width=310};var error=Ui.Text("",true);
        NumberBox Number(string label,double? value,double minimum,double maximum) {
            var box=new NumberBox {Header=label,Minimum=minimum,Maximum=maximum,Value=value??double.NaN,SpinButtonPlacementMode=NumberBoxSpinButtonPlacementMode.Compact};
            content.Children.Add(box);return box;
        }
        NumberBox? minW=null,maxW=null,minH=null,maxH=null,minDuration=null,maxDuration=null,minChannel=null,maxChannel=null;
        if(scope=="dimensions") {
            minW=Number("最小宽度 px",current.MinimumWidth,1,100000);maxW=Number("最大宽度 px",current.MaximumWidth,1,100000);
            minH=Number("最小高度 px",current.MinimumHeight,1,100000);maxH=Number("最大高度 px",current.MaximumHeight,1,100000);
        }
        if(scope=="duration") {
            minDuration=Number("最小时长（秒）",current.MinimumDurationMilliseconds/1000d,0,604800);
            maxDuration=Number("最大时长（秒）",current.MaximumDurationMilliseconds/1000d,0,604800);
        }
        if(scope=="channels") {
            minChannel=Number("最少声道",current.ChannelRanges?.FirstOrDefault()?.Minimum,1,1000000000);
            maxChannel=Number("最多声道",current.ChannelRanges?.FirstOrDefault()?.Maximum,1,1000000000);
        }
        content.Children.Add(error);
        int? Integer(NumberBox? box)=>box is null||double.IsNaN(box.Value)?null:(int)box.Value;
        content.Children.Add(Ui.Row(Ui.Button("清除此组",()=>{
            var latest=read().Facts??current;
            var cleared=scope switch {"dimensions"=>AspectFilterRules.ClearDimensions(latest),"duration"=>latest with {MinimumDurationMilliseconds=null,MaximumDurationMilliseconds=null},_=>latest with {ChannelRanges=null}};
            apply(read() with {Facts=AspectFilterRules.Normalize(cleared)});flyouts.Close();
        }),Ui.Button("应用",()=>{
            var ranges=new[]{(minW,maxW),(minH,maxH),(minDuration,maxDuration),(minChannel,maxChannel)};
            if(ranges.Any(pair=>pair.Item1 is {} a&&pair.Item2 is {} b&&!double.IsNaN(a.Value)&&!double.IsNaN(b.Value)&&a.Value>b.Value)) {error.Text="最大值不能小于最小值";return;}
            if(ranges.SelectMany(pair=>new[]{pair.Item1,pair.Item2}).Any(box=>box is not null&&!double.IsNaN(box.Value)&&(!double.IsFinite(box.Value)||box.Value<box.Minimum||box.Value>box.Maximum))) {error.Text="请输入范围内的有效数值";return;}
            if(new[]{minW,maxW,minH,maxH,minChannel,maxChannel}.Any(box=>box is not null&&!double.IsNaN(box.Value)&&box.Value!=Math.Truncate(box.Value))) {error.Text="像素和声道需要整数";return;}
            var next=current;
            if(minW is not null)next=next with {MinimumWidth=Integer(minW),MaximumWidth=Integer(maxW),MinimumHeight=Integer(minH),MaximumHeight=Integer(maxH),ShortEdgeRanges=null};
            if(minDuration is not null)next=next with {MinimumDurationMilliseconds=double.IsNaN(minDuration.Value)?null:(long)(minDuration.Value*1000),MaximumDurationMilliseconds=double.IsNaN(maxDuration!.Value)?null:(long)(maxDuration.Value*1000)};
            if(minChannel is not null)next=next with {ChannelRanges=Integer(minChannel) is null&&Integer(maxChannel) is null?null:[new(Integer(minChannel),Integer(maxChannel))]};
            apply(read() with {Facts=AspectFilterRules.Normalize(next)});flyouts.Close();
        })));
        flyouts.Show(anchor,new ScrollViewer {Content=content,MaxHeight=420,VerticalScrollBarVisibility=ScrollBarVisibility.Auto});
    }
}
