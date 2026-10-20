using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
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
        private readonly LinearGradientBrush source;
        private readonly LinearGradientBrush brush=new() {MappingMode=BrushMappingMode.Absolute};
        private readonly List<(GradientStop Stop,long Token)> subscriptions=[];
        public Surface(Border border,LinearGradientBrush source)
        {
            this.border=border; this.source=source;
            border.Background=brush; border.Loaded+=OnLoaded; border.Unloaded+=OnUnloaded; border.SizeChanged+=OnSizeChanged;
            CopyColors(); UpdateGeometry(); if(border.IsLoaded)Subscribe();
        }
        private void OnLoaded(object sender,RoutedEventArgs args) {Subscribe(); CopyColors(); UpdateGeometry();}
        private void OnUnloaded(object sender,RoutedEventArgs args) => Unsubscribe();
        private void OnSizeChanged(object sender,SizeChangedEventArgs args) => UpdateGeometry();
        private void Subscribe()
        {
            if(subscriptions.Count>0)return;
            foreach(var stop in source.GradientStops)
                subscriptions.Add((stop,stop.RegisterPropertyChangedCallback(GradientStop.ColorProperty,(_,_)=>CopyColors())));
        }
        private void Unsubscribe()
        {
            foreach(var (stop,token) in subscriptions)stop.UnregisterPropertyChangedCallback(GradientStop.ColorProperty,token);
            subscriptions.Clear();
        }
        private void CopyColors()
        {
            if(brush.GradientStops.Count!=source.GradientStops.Count) {
                brush.GradientStops.Clear(); foreach(var stop in source.GradientStops)brush.GradientStops.Add(new GradientStop {Color=stop.Color,Offset=stop.Offset});
            }
            else for(var i=0;i<source.GradientStops.Count;i++)brush.GradientStops[i].Color=source.GradientStops[i].Color;
        }
        private void UpdateGeometry()
        {
            var w=border.ActualWidth; var h=border.ActualHeight;
            if(w<=0 || h<=0)return;
            brush.StartPoint=new Point((w-h)/4,(w+3*h)/4);
            brush.EndPoint=new Point((3*w+h)/4,(h-w)/4);
        }
        public void Dispose()
        {
            Unsubscribe(); border.Loaded-=OnLoaded; border.Unloaded-=OnUnloaded; border.SizeChanged-=OnSizeChanged;
        }
    }
}
