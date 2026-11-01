using Microsoft.UI.Xaml;
using Cap7CE.WinUI.Localization;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Cap7CE.WinUI.Models;

namespace Cap7CE.WinUI.Controls;
internal sealed class FilterBar : UserControl
{
    private readonly StackPanel row=new() {Orientation=Orientation.Horizontal,Spacing=6};
    private readonly TextBlock count=new() {FontSize=12,FontWeight=Microsoft.UI.Text.FontWeights.SemiBold,VerticalAlignment=VerticalAlignment.Center,TextWrapping=TextWrapping.NoWrap};
    private readonly Button clear;
    private readonly FilterSection timeSection,typeSection,sizeSection;
    private readonly Dictionary<string,ToggleButton> times=[],types=[];
    private readonly List<ToggleButton> sizes=[];
    private readonly FilterFlyouts flyouts=new();
    private readonly FactFilterStrip facts;
    public BrowseFilter Value {get;private set;}=new();
    public event Action<BrowseFilter>? FilterChanged;
    public event Action<string,bool,FilterAvailabilityState>? MetadataUnavailable;
    public FilterBar()
    {
        var editors=new FilterEditors(()=>Value,Set,flyouts);
        clear=FilterSection.ActionButton("main.clearFilters",Clear,localized:true);
        clear.Style=(Style)Application.Current.Resources["CapFilterClearButton"];
        clear.HorizontalAlignment=HorizontalAlignment.Left;
        var title=L.Text("ui.filters.title");title.FontSize=12;title.FontWeight=Microsoft.UI.Text.FontWeights.SemiBold;
        title.TextWrapping=TextWrapping.NoWrap;title.VerticalAlignment=VerticalAlignment.Center;
        var actions=new Grid {Height=80,Margin=new(6,0,2,0)};
        foreach(var height in new[]{24,26,4,26})actions.RowDefinitions.Add(new(){Height=new(height)});
        actions.Children.Add(title);Grid.SetRow(count,1);actions.Children.Add(count);Grid.SetRow(clear,3);actions.Children.Add(clear);row.Children.Add(actions);
        L.Bind(count,ToolTipService.ToolTipProperty,"ui.filters.countHint");
        foreach(var (id,label) in FilterPresets.Times)times.Add(id,FilterSection.Option("ui.filters.time."+id,()=>Set(FilterPresets.Time(Value,id,DateTime.Now)),localized:true));
        timeSection=new("ui.filters.modified",FilterSection.Options(times.Values.Cast<UIElement>().ToArray(),3),editors.Dates,localized:true);row.Children.Add(timeSection);
        var typeGrid=new Grid {ColumnSpacing=4,RowSpacing=4};
        for(var i=0;i<6;i++)typeGrid.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        typeGrid.RowDefinitions.Add(new(){Height=new(26)});typeGrid.RowDefinitions.Add(new(){Height=new(26)});
        var index=0;
        foreach(var (id,label) in FormatRegistry.Categories) {
            var button=FilterSection.Option("ui.filters.kind."+id,()=>Set(FilterPresets.ToggleType(Value,id)),FilterIcons.Create(id),localized:true);
            button.IsEnabled=id=="other" || FormatRegistry.Extensions(id).Length>0;
            Grid.SetColumn(button,index%6);Grid.SetRow(button,index/6);typeGrid.Children.Add(button);types.Add(id,button);index++;
        }
        typeSection=new("ui.filters.kind",typeGrid,editors.Formats,localized:true);row.Children.Add(typeSection);
        var sizeKeys=new[]{"ui.filters.sizeTiny","ui.filters.sizeSmall","ui.filters.sizeMedium","ui.filters.sizeLarge","ui.filters.sizeHuge"};
        foreach(var (preset,key) in FilterPresets.Sizes.Zip(sizeKeys)) {var (_,min,max)=preset;sizes.Add(FilterSection.Option(key,()=>Set(Value with {
            MinimumBytes=Value.MinimumBytes==min && Value.MaximumBytes==max?null:min,
            MaximumBytes=Value.MinimumBytes==min && Value.MaximumBytes==max?null:max
        }),localized:true));}
        sizeSection=new("ui.filters.size",FilterSection.Options(sizes.Cast<UIElement>().ToArray(),3),editors.Size,localized:true);row.Children.Add(sizeSection);
        facts=new(()=>Value,Set,flyouts);facts.Unavailable+=(kind,colors,state)=>{flyouts.Close();MetadataUnavailable?.Invoke(kind,colors,state);};row.Children.Add(facts);
        var scroll=new ScrollViewer {Content=row,HorizontalScrollBarVisibility=ScrollBarVisibility.Hidden,VerticalScrollBarVisibility=ScrollBarVisibility.Disabled,
            HorizontalScrollMode=ScrollMode.Enabled,VerticalScrollMode=ScrollMode.Disabled,ZoomMode=ZoomMode.Disabled};
        scroll.PointerWheelChanged+=(_,e)=>{
            var point=e.GetCurrentPoint(scroll).Properties;
            if(scroll.ScrollableWidth<=0||point.IsHorizontalMouseWheel||Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(Windows.System.VirtualKey.Control).HasFlag(Windows.UI.Core.CoreVirtualKeyStates.Down))return;
            var offset=Math.Clamp(scroll.HorizontalOffset-point.MouseWheelDelta,0,scroll.ScrollableWidth);if(offset==scroll.HorizontalOffset)return;
            flyouts.Close();scroll.ChangeView(offset,null,null,true);e.Handled=true;
        };
        scroll.ViewChanged+=(_,_)=>flyouts.Close();
        Content=new Border {Style=(Style)Application.Current.Resources["CapFilterPanel"],Child=scroll};
        Unloaded+=(_,_)=>flyouts.Close();Render();
    }
    public void Restore(BrowseFilter filter) {if(!ReferenceEquals(Value,filter))flyouts.Close();Value=filter;Render();}
    public void SetAvailability(FilterAvailability state)=>facts.SetAvailability(state);
    public bool ContainsKeyboardTarget(DependencyObject target)
    {for(DependencyObject? item=target;item is not null;item=Microsoft.UI.Xaml.Media.VisualTreeHelper.GetParent(item))if(ReferenceEquals(item,this))return true;return false;}
    public void Clear()=>Set(new());
    private void Set(BrowseFilter filter) {Value=filter;Render();FilterChanged?.Invoke(filter);}
    private void Render()
    {
        L.Bind(count,TextBlock.TextProperty,Value.Count>0?"ui.filters.count":"ui.filters.inactive",()=>new Dictionary<string,object?>{{"count",Value.Count}});clear.IsEnabled=Value.Count>0;
        foreach(var (id,button) in times)button.IsChecked=Value.TimePreset==id;
        foreach(var (id,button) in types)button.IsChecked=FilterPresets.Selected(Value,id);
        for(var i=0;i<sizes.Count;i++)sizes[i].IsChecked=Value.MinimumBytes==FilterPresets.Sizes[i].Min && Value.MaximumBytes==FilterPresets.Sizes[i].Max;
        var customTime=Value.TimePreset=="custom";
        var customSize=(Value.MinimumBytes is not null || Value.MaximumBytes is not null)&&!sizes.Any(button=>button.IsChecked==true);
        if(customTime)L.Bind(timeSection.Summary,TextBlock.TextProperty,"ui.filters.custom");else L.Literal(timeSection.Summary,TextBlock.TextProperty,"");
        if(Value.Extensions.Length>0)L.Bind(typeSection.Summary,TextBlock.TextProperty,"ui.filters.formatCount",()=>new Dictionary<string,object?>{{"count",Value.Extensions.Length}});else L.Literal(typeSection.Summary,TextBlock.TextProperty,"");
        if(customSize)L.Bind(sizeSection.Summary,TextBlock.TextProperty,"ui.filters.custom");else L.Literal(sizeSection.Summary,TextBlock.TextProperty,"");
        if(customTime)L.Bind(timeSection.Summary,ToolTipService.ToolTipProperty,"ui.filters.dateRange",()=>new Dictionary<string,object?>{
            {"after",Value.After?.ToLocalTime().ToString("yyyy-MM-dd")??AppLanguage.Text("ui.filters.unlimited")},
            {"before",Value.Before?.AddDays(-1).ToLocalTime().ToString("yyyy-MM-dd")??AppLanguage.Text("ui.filters.unlimited")}});
        else L.Literal(timeSection.Summary,ToolTipService.ToolTipProperty,null);
        if(customSize)L.Bind(sizeSection.Summary,ToolTipService.ToolTipProperty,"ui.filters.byteRange",()=>new Dictionary<string,object?>{
            {"minimum",Value.MinimumBytes?.ToString("N0")??AppLanguage.Text("ui.filters.unlimited")},
            {"maximum",Value.MaximumBytes?.ToString("N0")??AppLanguage.Text("ui.filters.unlimited")}});
        else L.Literal(sizeSection.Summary,ToolTipService.ToolTipProperty,null);
        facts.Restore();
    }
}
