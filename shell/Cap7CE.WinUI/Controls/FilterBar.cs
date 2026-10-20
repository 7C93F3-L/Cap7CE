using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Controls;
internal sealed class FilterBar : UserControl
{
    private readonly StackPanel row=new() {Orientation=Orientation.Horizontal,Spacing=6};
    private readonly TextBlock count=new() {FontSize=12,Height=24,VerticalAlignment=VerticalAlignment.Center};
    private readonly Button clear;
    private readonly FilterSection timeSection,typeSection,sizeSection;
    private readonly Dictionary<string,ToggleButton> times=[],types=[];
    private readonly List<ToggleButton> sizes=[];
    private readonly FilterFlyouts flyouts=new();
    private readonly FactFilterStrip facts;
    public BrowseFilter Value {get;private set;}=new();
    public event Action<BrowseFilter>? FilterChanged;
    public FilterBar()
    {
        var editors=new FilterEditors(()=>Value,Set,flyouts);
        clear=FilterSection.ActionButton("清除筛选",()=>Set(new()));
        var actions=new StackPanel {Margin=new(0,0,2,0)};actions.Children.Add(count);actions.Children.Add(clear);row.Children.Add(actions);
        foreach(var (id,label) in FilterPresets.Times)times.Add(id,FilterSection.Option(label,()=>Set(FilterPresets.Time(Value,id,DateTime.Now))));
        timeSection=new("修改时间",FilterSection.Options(times.Values.Cast<UIElement>().ToArray(),3),editors.Dates);row.Children.Add(timeSection);
        var typeGrid=new Grid {ColumnSpacing=4,RowSpacing=4};
        for(var i=0;i<6;i++)typeGrid.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        typeGrid.RowDefinitions.Add(new(){Height=new(26)});typeGrid.RowDefinitions.Add(new(){Height=new(26)});
        var index=0;
        foreach(var (id,label) in FormatRegistry.Categories) {
            var button=FilterSection.Option(label,()=>Set(FilterPresets.ToggleType(Value,id)),FilterIcons.Create(id));
            button.IsEnabled=id=="other" || FormatRegistry.Extensions(id).Length>0;
            Grid.SetColumn(button,index%6);Grid.SetRow(button,index/6);typeGrid.Children.Add(button);types.Add(id,button);index++;
        }
        typeSection=new("文件种类",typeGrid,editors.Formats);row.Children.Add(typeSection);
        foreach(var (label,min,max) in FilterPresets.Sizes) sizes.Add(FilterSection.Option(label,()=>Set(Value with {
            MinimumBytes=Value.MinimumBytes==min && Value.MaximumBytes==max?null:min,
            MaximumBytes=Value.MinimumBytes==min && Value.MaximumBytes==max?null:max
        })));
        sizeSection=new("文件大小",FilterSection.Options(sizes.Cast<UIElement>().ToArray(),3),editors.Size);row.Children.Add(sizeSection);
        facts=new(()=>Value,Set,flyouts);row.Children.Add(facts);
        var scroll=new ScrollViewer {Content=row,HorizontalScrollBarVisibility=ScrollBarVisibility.Hidden,VerticalScrollBarVisibility=ScrollBarVisibility.Disabled,
            HorizontalScrollMode=ScrollMode.Enabled,VerticalScrollMode=ScrollMode.Disabled,ZoomMode=ZoomMode.Disabled};
        scroll.PointerWheelChanged+=(_,e)=>{if(scroll.ScrollableWidth<=0)return;flyouts.Close();scroll.ChangeView(scroll.HorizontalOffset-e.GetCurrentPoint(scroll).Properties.MouseWheelDelta,null,null,true);e.Handled=true;};
        scroll.ViewChanged+=(_,_)=>flyouts.Close();
        Content=new Border {Style=(Style)Application.Current.Resources["CapFilterPanel"],Child=scroll};
        Unloaded+=(_,_)=>flyouts.Close();Render();
    }
    public void Restore(BrowseFilter filter) {if(!ReferenceEquals(Value,filter))flyouts.Close();Value=filter;Render();}
    private void Set(BrowseFilter filter) {Value=filter;Render();FilterChanged?.Invoke(filter);}
    private void Render()
    {
        count.Text=$"筛选 · {Value.Count}";clear.IsEnabled=Value.Count>0;
        foreach(var (id,button) in times)button.IsChecked=Value.TimePreset==id;
        foreach(var (id,button) in types)button.IsChecked=FilterPresets.Selected(Value,id);
        for(var i=0;i<sizes.Count;i++)sizes[i].IsChecked=Value.MinimumBytes==FilterPresets.Sizes[i].Min && Value.MaximumBytes==FilterPresets.Sizes[i].Max;
        timeSection.Summary.Text=Value.TimePreset=="custom"?"自定":"";
        typeSection.Summary.Text=Value.Extensions.Length>0?$"{Value.Extensions.Length} 种":"";
        sizeSection.Summary.Text=(Value.MinimumBytes is not null || Value.MaximumBytes is not null) && !sizes.Any(button=>button.IsChecked==true)?"自定":"";
        facts.Restore();
    }
}
