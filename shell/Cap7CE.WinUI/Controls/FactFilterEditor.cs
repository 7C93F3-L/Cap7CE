using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
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
        ComboBox? mode=null;
        if(scope=="dimensions") {
            var exact=current.MinimumWidth is not null&&current.MinimumHeight is not null&&current.MinimumWidth==current.MaximumWidth&&current.MinimumHeight==current.MaximumHeight;
            mode=Ui.Select(["尺寸范围","精确尺寸"],exact?1:0,_=>{});content.Children.Add(mode);
            minW=Number("最小宽度 px",current.MinimumWidth,1,100000);maxW=Number("最大宽度 px",current.MaximumWidth,1,100000);
            minH=Number("最小高度 px",current.MinimumHeight,1,100000);maxH=Number("最大高度 px",current.MaximumHeight,1,100000);
            void Mode(){maxW.Visibility=maxH.Visibility=mode.SelectedIndex==1?Visibility.Collapsed:Visibility.Visible;minW.Header=mode.SelectedIndex==1?"宽度 px":"最小宽度 px";minH.Header=mode.SelectedIndex==1?"高度 px":"最小高度 px";}
            mode.SelectionChanged+=(_,_)=>Mode();Mode();
            content.Children.Insert(1,Ui.Row(Ui.Button("≥1920×1080",()=>{mode.SelectedIndex=0;minW.Value=1920;minH.Value=1080;maxW.Value=maxH.Value=double.NaN;}),
                Ui.Button("≥3840×2160",()=>{mode.SelectedIndex=0;minW.Value=3840;minH.Value=2160;maxW.Value=maxH.Value=double.NaN;})));
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
            if(ranges.Any(pair=>pair.Item1 is {} a&&pair.Item2 is {} b&&b.Visibility==Visibility.Visible&&!double.IsNaN(a.Value)&&!double.IsNaN(b.Value)&&a.Value>b.Value)) {error.Text="最大值不能小于最小值";return;}
            if(ranges.SelectMany(pair=>new[]{pair.Item1,pair.Item2}).Any(box=>box is not null&&box.Visibility==Visibility.Visible&&!double.IsNaN(box.Value)&&(!double.IsFinite(box.Value)||box.Value<box.Minimum||box.Value>box.Maximum))) {error.Text="请输入范围内的有效数值";return;}
            if(new[]{minW,maxW,minH,maxH,minChannel,maxChannel}.Any(box=>box is not null&&box.Visibility==Visibility.Visible&&!double.IsNaN(box.Value)&&box.Value!=Math.Truncate(box.Value))) {error.Text="像素和声道需要整数";return;}
            if(mode?.SelectedIndex==1&&(Integer(minW) is null||Integer(minH) is null)){error.Text="请输入精确宽度和高度";return;}
            var next=current;
            if(minW is not null)next=next with {MinimumWidth=Integer(minW),MaximumWidth=mode?.SelectedIndex==1?Integer(minW):Integer(maxW),MinimumHeight=Integer(minH),MaximumHeight=mode?.SelectedIndex==1?Integer(minH):Integer(maxH),ShortEdgeRanges=null};
            if(minDuration is not null)next=next with {MinimumDurationMilliseconds=double.IsNaN(minDuration.Value)?null:MediaFilterRules.Milliseconds(minDuration.Value,true),MaximumDurationMilliseconds=double.IsNaN(maxDuration!.Value)?null:MediaFilterRules.Milliseconds(maxDuration.Value,false)};
            if(next.MinimumDurationMilliseconds>next.MaximumDurationMilliseconds){error.Text="范围小于毫秒精度，请扩大范围";return;}
            if(minChannel is not null)next=next with {ChannelRanges=Integer(minChannel) is null&&Integer(maxChannel) is null?null:[new(Integer(minChannel),Integer(maxChannel))]};
            apply(read() with {Facts=AspectFilterRules.Normalize(next)});flyouts.Close();
        })));
        var scroll=new ScrollViewer {Content=content,MaxHeight=420,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};
        IdleScrollBars.Attach(scroll);flyouts.Show(anchor,scroll);
    }
}
