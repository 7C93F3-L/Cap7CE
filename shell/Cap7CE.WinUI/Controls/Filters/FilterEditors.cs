using Cap7CE.WinUI.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

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
        var fields=new Grid {ColumnSpacing=8,RowSpacing=6};
        fields.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});fields.ColumnDefinitions.Add(new(){Width=new(80)});
        for(var row=0;row<4;row++)fields.RowDefinitions.Add(new(){Height=GridLength.Auto});
        Add(Ui.Text("最小值"),0,0);Add(min,1,0);Add(minUnit,1,1);
        Add(Ui.Text("最大值"),2,0);Add(max,3,0);Add(maxUnit,3,1);
        foreach(var unit in new[]{minUnit,maxUnit}) {unit.MinWidth=0;unit.Height=30;unit.MinHeight=30;unit.HorizontalAlignment=HorizontalAlignment.Stretch;unit.VerticalAlignment=VerticalAlignment.Center;}
        var error=Ui.Text("",true);error.Visibility=Visibility.Collapsed;
        var content=Ui.Column(fields,error);content.Width=300;
        content.Children.Add(Ui.Row(Ui.Button("清除",()=>{apply(read() with {MinimumBytes=null,MaximumBytes=null});flyouts.Close();}),Ui.Button("应用",()=>{
            long? Bytes(NumberBox box,ComboBox unit)=>double.IsNaN(box.Value)?null:checked((long)Math.Round(box.Value*Math.Pow(1024,unit.SelectedIndex+1)));
            var minimum=Bytes(min,minUnit);var maximum=Bytes(max,maxUnit);
            if(minimum is null && maximum is null){ShowError("请输入大小范围");return;}
            if(minimum>maximum){ShowError("最大值不能小于最小值");return;}
            apply(read() with {MinimumBytes=minimum,MaximumBytes=maximum});flyouts.Close();
        })));
        flyouts.Show(anchor,content);
        void Add(FrameworkElement element,int row,int column){Grid.SetRow(element,row);Grid.SetColumn(element,column);fields.Children.Add(element);}
        void ShowError(string message){error.Text=message;error.Visibility=Visibility.Visible;}
    }
    public void Formats(Button anchor)
    {
        var content=new FormatPicker(FormatRegistry.Formats.Where(format=>format.CanSearch).Select(format=>format.Extension),FilterPresets.Extensions(read()),extensions=>{
            var next=read() with {Category="",ThreeDTypes=[],Extensions=extensions};
            apply(next with {Facts=FilterPresets.RetainFacts(next,read().Facts)});flyouts.Close();
        });
        flyouts.Show(anchor,content);
    }
    private static NumberBox Number(string heading,double? value)
    {
        var box=new NumberBox {Value=value??double.NaN,Minimum=0,Maximum=1e9,MinWidth=0,Height=30,MinHeight=30,
            FontSize=12,Padding=new(12,3,12,3),CornerRadius=new(15),BorderThickness=new(0),
            PlaceholderText="不限",SpinButtonPlacementMode=NumberBoxSpinButtonPlacementMode.Hidden};
        Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(box,heading);
        box.Loaded+=(_,_)=>StyleInput(box);
        return box;
        static void StyleInput(DependencyObject parent)
        {
            for(var i=0;i<VisualTreeHelper.GetChildrenCount(parent);i++) {
                var child=VisualTreeHelper.GetChild(parent,i);
                if(child is TextBox input)input.Style=(Style)Application.Current.Resources["CapWorkspaceInput"];
                else StyleInput(child);
            }
        }
    }
}
