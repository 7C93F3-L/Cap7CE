using Cap7CE.Core.Protocol;
using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls;
internal sealed class FactFilterEditor(Func<BrowseFilter> read,Action<BrowseFilter> apply,FilterFlyouts flyouts)
{
    public void Show(Button anchor,string domain)
    {
        var current=read().Facts??new CoreSearchFactFilter(domain,FormatRegistry.ExtractorVersion(domain));
        var content=new StackPanel {Spacing=10,Width=310};
        var error=Ui.Text("",true);
        NumberBox Number(string label,double? value,double maximum=1000000000) {
            var box=new NumberBox {Header=label,Minimum=0,Maximum=maximum,Value=value??double.NaN,SpinButtonPlacementMode=NumberBoxSpinButtonPlacementMode.Compact};
            content.Children.Add(box);return box;
        }
        NumberBox? minW=null,maxW=null,minH=null,maxH=null,minDuration=null,maxDuration=null,minCount=null,maxCount=null;
        if(domain is "image-dimensions" or "video") {
            minW=Number("最小宽度 px",current.MinimumWidth,100000);maxW=Number("最大宽度 px",current.MaximumWidth,100000);
            minH=Number("最小高度 px",current.MinimumHeight,100000);maxH=Number("最大高度 px",current.MaximumHeight,100000);
            minW.Minimum=maxW.Minimum=minH.Minimum=maxH.Minimum=1;
        }
        if(domain is "video" or "audio") {
            minDuration=Number("最小时长（秒）",current.MinimumDurationMilliseconds/1000d,604800);
            maxDuration=Number("最大时长（秒）",current.MaximumDurationMilliseconds/1000d,604800);
        }
        ComboBox? textKind=null;
        if(domain=="text-data") {
            textKind=Ui.Select(["文本字符数","CSV 记录数","JSON 记录数"],current.TextData?.FactKind switch {"csv"=>1,"json"=>2,_=>0},_=>{});
            content.Children.Add(textKind);
        }
        var countLabel=domain switch {"document"=>"页 / 幻灯片 / 工作表", "three-d"=>"三角面", "model"=>"模型参数", "text-data"=>"字符 / 记录", "font"=>"字重",_=>"文件"};
        (double? min,double? max)=domain switch {
            "document"=>(current.Document?.MinimumContentCount,current.Document?.MaximumContentCount),
            "three-d"=>(current.ThreeD?.MinimumTriangleCount,current.ThreeD?.MaximumTriangleCount),
            "model"=>(current.Model?.ParameterRanges?.FirstOrDefault()?.Minimum,current.Model?.ParameterRanges?.FirstOrDefault()?.Maximum),
            "text-data"=>(current.TextData?.FactKind=="text"?current.TextData.MinimumCharacterCount:current.TextData?.MinimumRecordCount,current.TextData?.FactKind=="text"?current.TextData.MaximumCharacterCount:current.TextData?.MaximumRecordCount),
            "archive"=>(current.Archive?.MinimumFileCount,current.Archive?.MaximumFileCount),_=>(null,null)
        };
        if(domain=="font"){min=current.Font?.WeightRanges?.FirstOrDefault()?.Minimum;max=current.Font?.WeightRanges?.FirstOrDefault()?.Maximum;}
        if(domain is "document" or "three-d" or "model" or "text-data" or "archive" or "font") {
            var limit=domain=="model"?1e15:1e9;
            minCount=Number("最少"+countLabel,min,limit);maxCount=Number("最多"+countLabel,max,limit);
            if(domain=="font"){minCount.Minimum=maxCount.Minimum=1;minCount.Maximum=maxCount.Maximum=1000;}
        }
        content.Children.Add(error);
        long? Value(NumberBox? box)=>box is null || double.IsNaN(box.Value)?null:checked((long)box.Value);
        content.Children.Add(Ui.Row(Ui.Button("清除此组",()=>{apply(read() with {Facts=null});flyouts.Close();}),Ui.Button("应用",()=>{
            var ranges=new[]{(minW,maxW),(minH,maxH),(minDuration,maxDuration),(minCount,maxCount)};
            if(ranges.Any(pair=>pair.Item1 is {} a&&pair.Item2 is {} b&&!double.IsNaN(a.Value)&&!double.IsNaN(b.Value)&&a.Value>b.Value)) {error.Text="最大值不能小于最小值";return;}
            if(ranges.SelectMany(pair=>new[]{pair.Item1,pair.Item2}).Any(box=>box is not null&&!double.IsNaN(box.Value)&&(double.IsInfinity(box.Value)||box.Value<0))) {error.Text="请输入有效数值";return;}
            if(new[]{minW,maxW,minH,maxH,minCount,maxCount}.Any(box=>box is not null&&!double.IsNaN(box.Value)&&box.Value!=Math.Truncate(box.Value))) {error.Text="像素和数量需要整数";return;}
            var next=current;
            if(minW is not null)next=next with {MinimumWidth=(int?)Value(minW),MaximumWidth=(int?)Value(maxW),MinimumHeight=(int?)Value(minH),MaximumHeight=(int?)Value(maxH)};
            if(minDuration is not null)next=next with {MinimumDurationMilliseconds=double.IsNaN(minDuration.Value)?null:(long)(minDuration.Value*1000),MaximumDurationMilliseconds=double.IsNaN(maxDuration!.Value)?null:(long)(maxDuration.Value*1000)};
            var lower=Value(minCount);var upper=Value(maxCount);var hasCount=lower is not null || upper is not null;
            next=domain switch {
                "document"=>next with {Document=hasCount?(current.Document??new()) with {MinimumContentCount=(int?)lower,MaximumContentCount=(int?)upper}:null},
                "three-d"=>next with {ThreeD=hasCount?(current.ThreeD??new()) with {MinimumTriangleCount=lower,MaximumTriangleCount=upper}:null},
                "model"=>next with {Model=hasCount?new([new(lower,upper)],current.Model?.Precisions):null},
                "text-data"=>next with {TextData=hasCount?textKind!.SelectedIndex switch {
                    1=>new("csv",MinimumRecordCount:lower,MaximumRecordCount:upper),2=>new("json",MinimumRecordCount:lower,MaximumRecordCount:upper),
                    _=>new("text",MinimumCharacterCount:lower,MaximumCharacterCount:upper)}:null},
                "archive"=>next with {Archive=hasCount?(current.Archive??new()) with {MinimumFileCount=(int?)lower,MaximumFileCount=(int?)upper}:null},
                "font"=>next with {Font=(current.Font??new()) with {WeightRanges=hasCount?[new((int?)lower,(int?)upper)]:null}},_=>next
            };
            if(next.Font==new CoreSearchFontFilter())next=next with {Font=null};
            apply(read() with {Facts=next==new CoreSearchFactFilter(domain,FormatRegistry.ExtractorVersion(domain))?null:next});flyouts.Close();
        })));
        flyouts.Show(anchor,new ScrollViewer {Content=content,MaxHeight=420,VerticalScrollBarVisibility=ScrollBarVisibility.Auto});
    }
}
