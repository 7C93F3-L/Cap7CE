using Cap7CE.Core.Protocol;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls;
internal sealed class AspectFilterEditor(Func<CoreSearchFactFilter> read,Action<CoreSearchFactFilter> apply,FilterFlyouts flyouts)
{
    public void Show(Button anchor)
    {
        var value=read();var draft=(value.AspectRanges??[]).ToList();
        if(value.MinimumAspectRatio is not null || value.MaximumAspectRatio is not null)draft.Add(new(value.MinimumAspectRatio,value.MaximumAspectRatio));
        var chips=new List<(Microsoft.UI.Xaml.Controls.Primitives.ToggleButton Button,CoreSearchAspectRange Range)>();
        var choices=new List<UIElement>();
        foreach(var (w,h) in AspectFilterRules.Common) {
            var range=AspectFilterRules.Around(w,h);
            var button=FilterSection.Option($"{w}:{h}",()=>{if(draft.Contains(range))draft.Remove(range);else draft.Add(range);});
            button.IsChecked=draft.Contains(range);choices.Add(button);chips.Add((button,range));
        }
        var presets=FilterSection.Options(choices,3);
        foreach(var column in presets.ColumnDefinitions)column.Width=new(1,GridUnitType.Star);
        foreach(var (button,_) in chips)button.HorizontalAlignment=HorizontalAlignment.Stretch;
        var width=new NumberBox {Minimum=1,Maximum=100000,Value=double.NaN,Width=110};
        var height=new NumberBox {Minimum=1,Maximum=100000,Value=double.NaN,Width=110};
        L.Bind(width,NumberBox.HeaderProperty,"ui.facts.width");L.Bind(height,NumberBox.HeaderProperty,"ui.facts.height");
        var error=Ui.Text("",true);var custom=new StackPanel {Spacing=4};
        void Extras()
        {
            custom.Children.Clear();
            foreach(var range in draft.Where(r=>chips.All(c=>c.Range!=r)).ToArray()) {
                var remove=FilterSection.ActionButton(AspectFilterRules.Label(range)+" ×",()=>{});
                remove.Click+=(_,_)=>{draft.Remove(range);Extras();};custom.Children.Add(remove);
            }
        }
        Extras();
        var title=L.Text("ui.facts.commonRatios");title.FontSize=14;title.TextWrapping=TextWrapping.NoWrap;var content=Ui.Column(title,presets,Ui.Row(width,height),custom,error);content.Width=226;
        var add=L.Button("ui.facts.addRatio",()=>{
            if(double.IsNaN(width.Value)||double.IsNaN(height.Value)||width.Value!=Math.Truncate(width.Value)||height.Value!=Math.Truncate(height.Value)) {L.Bind(error,TextBlock.TextProperty,"ui.facts.ratioInteger");return;}
            var w=(int)width.Value;var h=(int)height.Value;
            if(w is <1 or >100000 || h is <1 or >100000){L.Bind(error,TextBlock.TextProperty,"ui.facts.ratioInteger");return;}
            var range=AspectFilterRules.Around(w,h);L.Literal(error,TextBlock.TextProperty,"");
            if(!draft.Contains(range))draft.Add(range);
            foreach(var (button,choice) in chips)button.IsChecked=draft.Contains(choice);
            Extras();
        });content.Children.Insert(3,add);
        content.Children.Add(Ui.Row(L.Button("ui.facts.clearGroup",()=>{apply(AspectFilterRules.ClearAspect(read()));flyouts.Close();}),L.Button("common.apply",()=>{
            if(draft.Count>32){L.Bind(error,TextBlock.TextProperty,"ui.facts.ratioLimit");return;}
            apply(read() with {MinimumAspectRatio=null,MaximumAspectRatio=null,AspectRanges=draft.Count>0?draft.ToArray():null});flyouts.Close();
        })));
        var scroll=new ScrollViewer {Content=content,MaxHeight=420,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};
        IdleScrollBars.Attach(scroll);flyouts.Show(anchor,scroll);
    }
}
