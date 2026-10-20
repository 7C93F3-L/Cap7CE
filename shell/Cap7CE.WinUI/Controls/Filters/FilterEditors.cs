using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace Cap7CE.WinUI.Controls;

internal sealed class FilterEditors(Func<BrowseFilter> read,Action<BrowseFilter> apply,FilterFlyouts flyouts)
{
    public void Dates(Button anchor)
    {
        var value=read();
        var start=new CalendarDatePicker {Header="开始日期",PlaceholderText="不限",Date=value.After,MinDate=DateTimeOffset.UnixEpoch};
        var end=new CalendarDatePicker {Header="结束日期（含当天）",PlaceholderText="不限",Date=value.Before?.AddDays(-1),MinDate=DateTimeOffset.UnixEpoch};
        var error=Ui.Text("",true);var content=Ui.Column(start,end,error);
        content.Children.Add(Ui.Row(Ui.Button("清除",()=>{apply(read() with {TimePreset="all",After=null,Before=null});flyouts.Close();}),Ui.Button("应用",()=>{
            if(start.Date is null && end.Date is null){error.Text="请选择开始或结束日期";return;}
            if(start.Date?.Date>end.Date?.Date){error.Text="结束日期不能早于开始日期";return;}
            apply(read() with {TimePreset="custom",After=start.Date is {} a?new DateTimeOffset(a.Date):null,Before=end.Date is {} b?new DateTimeOffset(b.Date.AddDays(1)):null});flyouts.Close();
        })));
        flyouts.Show(anchor,content);
    }
    public void Size(Button anchor)
    {
        var value=read();var min=Number("最小值",value.MinimumBytes/1048576d);var max=Number("最大值",value.MaximumBytes/1048576d);
        var minUnit=Ui.Select(["KB","MB","GB"],1,_=>{});var maxUnit=Ui.Select(["KB","MB","GB"],1,_=>{});
        var error=Ui.Text("",true);var content=Ui.Column(Ui.Row(min,minUnit),Ui.Row(max,maxUnit),error);
        content.Children.Add(Ui.Row(Ui.Button("清除",()=>{apply(read() with {MinimumBytes=null,MaximumBytes=null});flyouts.Close();}),Ui.Button("应用",()=>{
            long? Bytes(NumberBox box,ComboBox unit)=>double.IsNaN(box.Value)?null:checked((long)Math.Round(box.Value*Math.Pow(1024,unit.SelectedIndex+1)));
            var minimum=Bytes(min,minUnit);var maximum=Bytes(max,maxUnit);
            if(minimum is null && maximum is null){error.Text="请输入大小范围";return;}
            if(minimum>maximum){error.Text="最大值不能小于最小值";return;}
            apply(read() with {MinimumBytes=minimum,MaximumBytes=maximum});flyouts.Close();
        })));
        flyouts.Show(anchor,content);
    }
    public void Formats(Button anchor)
    {
        var selected=FilterPresets.Extensions(read()).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var search=new TextBox {PlaceholderText="查找扩展名，如 png、psd",Width=310};
        var choices=new StackPanel {Spacing=3};var boxes=new List<(CheckBox Box,string Extension)>();
        foreach(var category in FormatRegistry.Categories.Where(c=>c.Id!="other")) {
            choices.Children.Add(new TextBlock {Text=category.Label,FontSize=12,Margin=new(0,8,0,2)});
            foreach(var extension in FormatRegistry.Extensions(category.Id).Distinct().Order()) {
                var box=new CheckBox {Content=extension,IsChecked=selected.Contains(extension),MinHeight=28};
                boxes.Add((box,extension));choices.Children.Add(box);
            }
        }
        search.TextChanged+=(_,_)=>{foreach(var (box,extension) in boxes)box.Visibility=extension.Contains(search.Text.Trim().TrimStart('.'),StringComparison.OrdinalIgnoreCase)?Visibility.Visible:Visibility.Collapsed;};
        var scroll=new ScrollViewer {Content=choices,MaxHeight=240,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};var content=Ui.Column(search,scroll);
        content.Children.Add(Ui.Row(Ui.Button("全不选",()=>{foreach(var (box,_) in boxes)box.IsChecked=false;}),Ui.Button("应用",()=>{
            var next=read() with {Category="",Extensions=boxes.Where(entry=>entry.Box.IsChecked==true).Select(entry=>entry.Extension).Distinct().ToArray()};
            apply(next with {Facts=FilterPresets.Domain(next)==read().Facts?.Kind?read().Facts:null});flyouts.Close();
        })));
        flyouts.Show(anchor,content);
    }
    private static NumberBox Number(string heading,double? value)=>new() {Header=heading,Value=value??double.NaN,Minimum=0,Maximum=1e9,Width=200,SpinButtonPlacementMode=NumberBoxSpinButtonPlacementMode.Compact};
}
