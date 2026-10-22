using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Media;
using Windows.Foundation;

namespace Cap7CE.WinUI.Themes;

// Shared color stops, per-surface geometry: CSS 45deg remains 45deg at any aspect ratio.
public sealed class AccentGradient : DependencyObject
{
    public static readonly DependencyProperty SourceProperty = DependencyProperty.RegisterAttached("Source",typeof(Brush),typeof(AccentGradient),
        new PropertyMetadata(null,OnSourceChanged));
    private static readonly DependencyProperty StateProperty = DependencyProperty.RegisterAttached("State",typeof(object),typeof(AccentGradient),new PropertyMetadata(null));
    public static Brush? GetSource(DependencyObject target) => (Brush?)target.GetValue(SourceProperty);
    public static void SetSource(DependencyObject target,Brush? value) => target.SetValue(SourceProperty,value);
    private static void OnSourceChanged(DependencyObject target,DependencyPropertyChangedEventArgs args)
    {
        if(target is not Border border)return;
        if(border.GetValue(StateProperty) is Surface previous)previous.Dispose();
        border.SetValue(StateProperty,args.NewValue is LinearGradientBrush source?new Surface(border,source):null);
        if(args.NewValue is not LinearGradientBrush)border.Background=(Brush?)args.NewValue;
    }

    private sealed class Surface : IDisposable
    {
        private readonly Border border;
        private readonly LinearGradientBrush brush=new() {MappingMode=BrushMappingMode.Absolute};
        public Surface(Border border,LinearGradientBrush source)
        {
            this.border=border;
            foreach(var sourceStop in source.GradientStops) {
                var stop=new GradientStop();
                BindingOperations.SetBinding(stop,GradientStop.ColorProperty,new Binding {Source=sourceStop,Path=new(nameof(GradientStop.Color))});
                BindingOperations.SetBinding(stop,GradientStop.OffsetProperty,new Binding {Source=sourceStop,Path=new(nameof(GradientStop.Offset))});
                brush.GradientStops.Add(stop);
            }
            border.Background=brush; border.Loaded+=OnLoaded; border.SizeChanged+=OnSizeChanged;
            UpdateGeometry();
        }
        private void OnLoaded(object sender,RoutedEventArgs args) => UpdateGeometry();
        private void OnSizeChanged(object sender,SizeChangedEventArgs args) => UpdateGeometry();
        private void UpdateGeometry()
        {
            var w=border.ActualWidth; var h=border.ActualHeight;
            if(w<=0 || h<=0)return;
            brush.StartPoint=new Point((w-h)/4,(w+3*h)/4);
            brush.EndPoint=new Point((3*w+h)/4,(h-w)/4);
        }
        public void Dispose()
        {
            border.Loaded-=OnLoaded; border.SizeChanged-=OnSizeChanged;
            foreach(var stop in brush.GradientStops) {
                stop.ClearValue(GradientStop.ColorProperty);stop.ClearValue(GradientStop.OffsetProperty);
            }
        }
    }
}
