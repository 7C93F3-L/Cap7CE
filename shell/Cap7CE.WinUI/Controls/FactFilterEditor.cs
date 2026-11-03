using Cap7CE.Core.Protocol;
using L=Cap7CE.WinUI.Localization.LanguageUi;
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
        var content=new StackPanel {Spacing=10,Width=scope=="dimensions"?240:200};var error=Ui.Text("",true);
        NumberBox Number(string label,double? value,double minimum,double maximum) {
            var box=new NumberBox {Minimum=minimum,Maximum=maximum,Value=value??double.NaN,SpinButtonPlacementMode=NumberBoxSpinButtonPlacementMode.Compact};
            L.Bind(box,NumberBox.HeaderProperty,label);content.Children.Add(box);return box;
        }
        NumberBox? minW=null,maxW=null,minH=null,maxH=null,minDuration=null,maxDuration=null,minChannel=null,maxChannel=null;
        ComboBox? mode=null;
        if(scope=="dimensions") {
            var exact=current.MinimumWidth is not null&&current.MinimumHeight is not null&&current.MinimumWidth==current.MaximumWidth&&current.MinimumHeight==current.MaximumHeight;
            mode=L.Choice(["ui.facts.dimensionRange","ui.facts.exactDimensions"],exact?1:0);content.Children.Add(mode);
            minW=Number("ui.facts.minWidth",current.MinimumWidth,1,100000);maxW=Number("ui.facts.maxWidth",current.MaximumWidth,1,100000);
            minH=Number("ui.facts.minHeight",current.MinimumHeight,1,100000);maxH=Number("ui.facts.maxHeight",current.MaximumHeight,1,100000);
            void Mode(){maxW.Visibility=maxH.Visibility=mode.SelectedIndex==1?Visibility.Collapsed:Visibility.Visible;L.Bind(minW,NumberBox.HeaderProperty,mode.SelectedIndex==1?"ui.facts.widthPixels":"ui.facts.minWidth");L.Bind(minH,NumberBox.HeaderProperty,mode.SelectedIndex==1?"ui.facts.heightPixels":"ui.facts.minHeight");}
            mode.SelectionChanged+=(_,_)=>Mode();Mode();
            content.Children.Insert(1,Ui.Row(L.Button("ui.facts.hdPreset",()=>{mode.SelectedIndex=0;minW.Value=1920;minH.Value=1080;maxW.Value=maxH.Value=double.NaN;}),
                L.Button("ui.facts.uhdPreset",()=>{mode.SelectedIndex=0;minW.Value=3840;minH.Value=2160;maxW.Value=maxH.Value=double.NaN;})));
        }
        if(scope=="duration") {
            minDuration=Number("ui.facts.minDuration",current.MinimumDurationMilliseconds/1000d,0,604800);
            maxDuration=Number("ui.facts.maxDuration",current.MaximumDurationMilliseconds/1000d,0,604800);
        }
        if(scope=="channels") {
            minChannel=Number("ui.facts.minChannels",current.ChannelRanges?.FirstOrDefault()?.Minimum,1,1000000000);
            maxChannel=Number("ui.facts.maxChannels",current.ChannelRanges?.FirstOrDefault()?.Maximum,1,1000000000);
        }
        content.Children.Add(error);
        int? Integer(NumberBox? box)=>box is null||double.IsNaN(box.Value)?null:(int)box.Value;
        content.Children.Add(Ui.Row(L.Button("ui.facts.clearGroup",()=>{
            var latest=read().Facts??current;
            var cleared=scope switch {"dimensions"=>AspectFilterRules.ClearDimensions(latest),"duration"=>latest with {MinimumDurationMilliseconds=null,MaximumDurationMilliseconds=null},_=>latest with {ChannelRanges=null}};
            apply(read() with {Facts=AspectFilterRules.Normalize(cleared)});flyouts.Close();
        }),L.Button("common.apply",()=>{
            var ranges=new[]{(minW,maxW),(minH,maxH),(minDuration,maxDuration),(minChannel,maxChannel)};
            if(ranges.Any(pair=>pair.Item1 is {} a&&pair.Item2 is {} b&&b.Visibility==Visibility.Visible&&!double.IsNaN(a.Value)&&!double.IsNaN(b.Value)&&a.Value>b.Value)) {L.Bind(error,TextBlock.TextProperty,"ui.filters.invalidRange");return;}
            if(ranges.SelectMany(pair=>new[]{pair.Item1,pair.Item2}).Any(box=>box is not null&&box.Visibility==Visibility.Visible&&!double.IsNaN(box.Value)&&(!double.IsFinite(box.Value)||box.Value<box.Minimum||box.Value>box.Maximum))) {L.Bind(error,TextBlock.TextProperty,"ui.facts.validNumber");return;}
            if(new[]{minW,maxW,minH,maxH,minChannel,maxChannel}.Any(box=>box is not null&&box.Visibility==Visibility.Visible&&!double.IsNaN(box.Value)&&box.Value!=Math.Truncate(box.Value))) {L.Bind(error,TextBlock.TextProperty,"ui.facts.integerPixelsChannels");return;}
            if(mode?.SelectedIndex==1&&(Integer(minW) is null||Integer(minH) is null)){L.Bind(error,TextBlock.TextProperty,"ui.facts.enterDimensions");return;}
            var next=current;
            if(minW is not null)next=next with {MinimumWidth=Integer(minW),MaximumWidth=mode?.SelectedIndex==1?Integer(minW):Integer(maxW),MinimumHeight=Integer(minH),MaximumHeight=mode?.SelectedIndex==1?Integer(minH):Integer(maxH),ShortEdgeRanges=null};
            if(minDuration is not null)next=next with {MinimumDurationMilliseconds=double.IsNaN(minDuration.Value)?null:MediaFilterRules.Milliseconds(minDuration.Value,true),MaximumDurationMilliseconds=double.IsNaN(maxDuration!.Value)?null:MediaFilterRules.Milliseconds(maxDuration.Value,false)};
            if(next.MinimumDurationMilliseconds>next.MaximumDurationMilliseconds){L.Bind(error,TextBlock.TextProperty,"ui.facts.durationPrecision");return;}
            if(minChannel is not null)next=next with {ChannelRanges=Integer(minChannel) is null&&Integer(maxChannel) is null?null:[new(Integer(minChannel),Integer(maxChannel))]};
            apply(read() with {Facts=AspectFilterRules.Normalize(next)});flyouts.Close();
        })));
        var scroll=new ScrollViewer {Content=content,MaxHeight=420,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};
        IdleScrollBars.Attach(scroll);flyouts.Show(anchor,scroll);
    }
}
