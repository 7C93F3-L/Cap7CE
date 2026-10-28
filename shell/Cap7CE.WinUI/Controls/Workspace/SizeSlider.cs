using Microsoft.UI.Xaml;
using Cap7CE.WinUI.Localization;
using L=Cap7CE.WinUI.Localization.LanguageUi;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Markup;
using Microsoft.UI.Xaml.Media;
using Windows.Foundation;

namespace Cap7CE.WinUI.Controls;

internal class SizeSlider : UserControl
{
    private readonly Slider slider;
    public double Value=>slider.Value;
    public event Action? CommitRequested;
    public SizeSlider(string titleKey,double value,double minimum,double maximum,double step,double largeChange,double defaultValue,Func<double,string> format,Action<double> preview,bool showTitle=true)
    {
        Resources.MergedDictionaries.Add(new ResourceDictionary {Source=new Uri("ms-appx:///Themes/GridSizePickerResources.xaml")});
        var panel=new StackPanel {Width=240,Spacing=6,HorizontalAlignment=HorizontalAlignment.Right};
        var header=new Grid();header.ColumnDefinitions.Add(new(){Width=new(1,GridUnitType.Star)});header.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        var title=showTitle?L.Text(titleKey):Ui.Text("");title.FontSize=14;title.FontWeight=Microsoft.UI.Text.FontWeights.SemiBold;title.VerticalAlignment=VerticalAlignment.Center;header.Children.Add(title);
        var current=Ui.Text(format(value),true);current.FontSize=13;current.VerticalAlignment=VerticalAlignment.Center;Grid.SetColumn(current,1);header.Children.Add(current);
        panel.Children.Add(header);
        slider=new Slider {Minimum=minimum,Maximum=maximum,Value=value,StepFrequency=step,SmallChange=step,LargeChange=largeChange,
            HorizontalAlignment=HorizontalAlignment.Stretch,ThumbToolTipValueConverter=new ValueConverter(format)};
        ApplyAccentColors();
        L.Bind(slider,AutomationProperties.NameProperty,titleKey);
        L.Bind(slider,AutomationProperties.HelpTextProperty,"main.sliderHelp",()=>new Dictionary<string,object?>{{"value",format(defaultValue)}});
        slider.ValueChanged+=(_,e)=>{current.Text=format(e.NewValue);preview(e.NewValue);};panel.Children.Add(slider);
        var scale=new Grid();
        var small=L.Text("main.sliderSmaller",true);small.HorizontalAlignment=HorizontalAlignment.Left;small.FontSize=12;small.VerticalAlignment=VerticalAlignment.Center;scale.Children.Add(small);
        var reset=new HyperlinkButton {HorizontalAlignment=HorizontalAlignment.Left,FontSize=12,Padding=new(6,0,6,0),MinHeight=24,MinWidth=0};
        L.Bind(reset,HyperlinkButton.ContentProperty,"main.sliderDefault");L.Bind(reset,AutomationProperties.NameProperty,"main.sliderReset",()=>new Dictionary<string,object?>{{"title",AppLanguage.Text(titleKey)},{"value",format(defaultValue)}});L.Bind(reset,ToolTipService.ToolTipProperty,"main.sliderResetHint",()=>new Dictionary<string,object?>{{"value",format(defaultValue)}});reset.Click+=(_,_)=>{slider.Value=defaultValue;CommitRequested?.Invoke();};
        scale.Children.Add(reset);
        var large=L.Text("main.sliderLarger",true);large.FontSize=12;large.HorizontalAlignment=HorizontalAlignment.Right;large.VerticalAlignment=VerticalAlignment.Center;scale.Children.Add(large);
        void AlignDefault()
        {
            var track=FindPart(slider,"HorizontalTemplate");var thumb=FindPart(slider,"HorizontalThumb");
            if(track is null||thumb is null||track.ActualWidth<=0||reset.ActualWidth<=0)return;
            var ratio=(defaultValue-slider.Minimum)/(slider.Maximum-slider.Minimum);
            if(slider.FlowDirection==FlowDirection.RightToLeft)ratio=1-ratio;
            var center=track.TransformToVisual(scale).TransformPoint(new Point(0,0)).X
                +thumb.ActualWidth/2+Math.Max(0,track.ActualWidth-thumb.ActualWidth)*ratio;
            reset.Margin=new(Math.Clamp(center-reset.ActualWidth/2,0,Math.Max(0,scale.ActualWidth-reset.ActualWidth)),0,0,0);
        }
        Loaded+=(_,_)=>AlignDefault();slider.SizeChanged+=(_,_)=>AlignDefault();reset.SizeChanged+=(_,_)=>AlignDefault();
        slider.AddHandler(UIElement.PointerReleasedEvent,new Microsoft.UI.Xaml.Input.PointerEventHandler((_,_)=>CommitRequested?.Invoke()),true);
        slider.KeyUp+=(_,_)=>CommitRequested?.Invoke();slider.LostFocus+=(_,_)=>CommitRequested?.Invoke();
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
    private sealed class ValueConverter(Func<double,string> format) : IValueConverter
    {
        public object Convert(object value,Type targetType,object parameter,string language)=>format((double)value);
        public object ConvertBack(object value,Type targetType,object parameter,string language)=>throw new NotSupportedException();
    }
}
