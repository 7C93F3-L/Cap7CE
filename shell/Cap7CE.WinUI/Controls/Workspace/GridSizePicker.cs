using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Markup;
using Microsoft.UI.Xaml.Media;
using Windows.Foundation;

namespace Cap7CE.WinUI.Controls;

internal sealed class GridSizePicker : UserControl
{
    private readonly Slider slider;
    public double Value=>slider.Value;
    public GridSizePicker(double value,Action<double> preview)
    {
        Resources.MergedDictionaries.Add(new ResourceDictionary {Source=new Uri("ms-appx:///Themes/GridSizePickerResources.xaml")});
        var panel=new StackPanel {Width=240,Spacing=6};
        var header=new Grid();header.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});header.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        header.Children.Add(new TextBlock {Text="网格大小",FontSize=14,FontWeight=Microsoft.UI.Text.FontWeights.SemiBold,VerticalAlignment=VerticalAlignment.Center});
        var current=Ui.Text(Percent(value),true);current.FontSize=13;current.VerticalAlignment=VerticalAlignment.Center;Grid.SetColumn(current,1);header.Children.Add(current);
        panel.Children.Add(header);
        slider=new Slider {Minimum=96,Maximum=280,Value=value,StepFrequency=4,SmallChange=4,LargeChange=16,
            HorizontalAlignment=HorizontalAlignment.Stretch,ThumbToolTipValueConverter=new PercentageConverter()};
        ApplyAccentColors();
        AutomationProperties.SetName(slider,"网格大小");
        AutomationProperties.SetHelpText(slider,"默认100%；方向键微调，Page Up和Page Down较大幅度调整");
        slider.ValueChanged+=(_,e)=>{current.Text=Percent(e.NewValue);preview(e.NewValue);};panel.Children.Add(slider);
        var scale=new Grid();
        var small=Ui.Text("较小",true);small.HorizontalAlignment=HorizontalAlignment.Left;small.FontSize=12;small.VerticalAlignment=VerticalAlignment.Center;scale.Children.Add(small);
        var reset=new HyperlinkButton {HorizontalAlignment=HorizontalAlignment.Left,Content="默认",FontSize=12,Padding=new(6,0,6,0),MinHeight=24,MinWidth=0};
        AutomationProperties.SetName(reset,"恢复默认网格大小（100%）");ToolTipService.SetToolTip(reset,"恢复100%");reset.Click+=(_,_)=>slider.Value=160;
        scale.Children.Add(reset);
        var large=Ui.Text("较大",true);large.FontSize=12;large.HorizontalAlignment=HorizontalAlignment.Right;large.VerticalAlignment=VerticalAlignment.Center;scale.Children.Add(large);
        void AlignDefault()
        {
            var track=FindPart(slider,"HorizontalTemplate");var thumb=FindPart(slider,"HorizontalThumb");
            if(track is null||thumb is null||track.ActualWidth<=0||reset.ActualWidth<=0)return;
            var ratio=(160-slider.Minimum)/(slider.Maximum-slider.Minimum);
            if(slider.FlowDirection==FlowDirection.RightToLeft)ratio=1-ratio;
            var center=track.TransformToVisual(scale).TransformPoint(new Point(0,0)).X
                +thumb.ActualWidth/2+Math.Max(0,track.ActualWidth-thumb.ActualWidth)*ratio;
            reset.Margin=new(Math.Clamp(center-reset.ActualWidth/2,0,Math.Max(0,scale.ActualWidth-reset.ActualWidth)),0,0,0);
        }
        Loaded+=(_,_)=>AlignDefault();slider.SizeChanged+=(_,_)=>AlignDefault();reset.SizeChanged+=(_,_)=>AlignDefault();
        panel.Children.Add(scale);Content=panel;
    }
    private void ApplyAccentColors()
    {
        string[] thumbKeys=["SliderThumbBackground","SliderThumbBackgroundPointerOver","SliderThumbBackgroundPressed"];
        string[] trackKeys=["SliderTrackValueFill","SliderTrackValueFillPointerOver","SliderTrackValueFillPressed"];
        foreach(var theme in new[]{"Light","Default"}) {
            var palette=new ResourceDictionary();
            foreach(var key in thumbKeys)palette[key]=Application.Current.Resources["CapAccentBrush"];
            foreach(var key in trackKeys)palette[key]=Application.Current.Resources["CapAccentGradient"];
            slider.Resources.ThemeDictionaries[theme]=palette;
        }
        var systemBrushes=string.Join("",thumbKeys.Concat(trackKeys).Select(key=>
            $"<SolidColorBrush x:Key='{key}' Color='{{ThemeResource SystemColorHighlightColor}}'/>"));
        slider.Resources.ThemeDictionaries["HighContrast"]=(ResourceDictionary)XamlReader.Load(
            "<ResourceDictionary xmlns='http://schemas.microsoft.com/winfx/2006/xaml/presentation' xmlns:x='http://schemas.microsoft.com/winfx/2006/xaml'>"+systemBrushes+"</ResourceDictionary>");
    }
    private static FrameworkElement? FindPart(DependencyObject parent,string name)
    {
        for(var i=0;i<VisualTreeHelper.GetChildrenCount(parent);i++) {
            var child=VisualTreeHelper.GetChild(parent,i);
            if(child is FrameworkElement element&&element.Name==name)return element;
            if(FindPart(child,name) is {} result)return result;
        }
        return null;
    }
    private static string Percent(double value)=>$"{value/160:0%}";
    private sealed class PercentageConverter : IValueConverter
    {
        public object Convert(object value,Type targetType,object parameter,string language)=>Percent((double)value);
        public object ConvertBack(object value,Type targetType,object parameter,string language)=>throw new NotSupportedException();
    }
}
