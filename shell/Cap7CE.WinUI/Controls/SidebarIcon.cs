using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Markup;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;
using Path = Microsoft.UI.Xaml.Shapes.Path;

namespace Cap7CE.WinUI.Controls;

public sealed class SidebarIcon : UserControl
{
    private sealed record Asset(string Name, double Width, double Height, string Path);
    private static readonly Asset[] assets = JsonSerializer.Deserialize<Asset[]>(
        File.ReadAllText(System.IO.Path.Combine(AppContext.BaseDirectory,"Assets/sidebar-icons.json")),
        new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
    public static readonly DependencyProperty KindProperty = DependencyProperty.Register(nameof(Kind),typeof(string),typeof(SidebarIcon),
        new PropertyMetadata("folder",(sender,_)=>((SidebarIcon)sender).Draw()));
    public static readonly DependencyProperty IsActiveProperty = DependencyProperty.Register(nameof(IsActive),typeof(bool),typeof(SidebarIcon),
        new PropertyMetadata(false,(sender,_)=>((SidebarIcon)sender).Draw()));
    public string Kind { get => (string)GetValue(KindProperty); set => SetValue(KindProperty,value); }
    public bool IsActive { get => (bool)GetValue(IsActiveProperty); set => SetValue(IsActiveProperty,value); }
    public SidebarIcon() { IsHitTestVisible=false; Draw(); }

    private void Draw()
    {
        var asset=assets.FirstOrDefault(item=>item.Name==Kind);
        var canvas=new Canvas {Width=asset?.Width??24,Height=asset?.Height??24};
        if(asset is not null) canvas.Children.Add(Shape(asset.Path,false));
        else if(Kind is "top" or "right")
        {
            var outline=new Rectangle {Width=18,Height=16,RadiusX=2,RadiusY=2,StrokeThickness=1.5};
            Bind(outline,Microsoft.UI.Xaml.Shapes.Shape.StrokeProperty);Canvas.SetLeft(outline,3);Canvas.SetTop(outline,4);canvas.Children.Add(outline);
            canvas.Children.Add(Shape(Kind=="top"?"M3 9H21":"M15 4V20",true));
            var area=Shape(Kind=="top"?"M5 6H19V7H5Z":"M17 6H19V18H17Z",false);
            area.Opacity=IsActive?1:.3;canvas.Children.Add(area);
        }
        else canvas.Children.Add(Shape(Kind switch {
            "computer"=>"M4 4H20V16H4Z M12 16V20 M8 20H16",
            "add"=>"M12 5V19 M5 12H19", _=>"M5 12H19"
        },true));
        Content=new Viewbox {Child=canvas,Stretch=Stretch.Uniform};
    }

    private Path Shape(string data,bool outline)
    {
        var path=new Path {Data=(Geometry)XamlBindingHelper.ConvertValue(typeof(Geometry),"F1 "+data)};
        if(outline) {path.StrokeThickness=1.5;path.StrokeStartLineCap=path.StrokeEndLineCap=PenLineCap.Round;path.StrokeLineJoin=PenLineJoin.Round;}
        Bind(path,outline?Microsoft.UI.Xaml.Shapes.Shape.StrokeProperty:Microsoft.UI.Xaml.Shapes.Shape.FillProperty);
        return path;
    }
    private void Bind(DependencyObject target,DependencyProperty property) => BindingOperations.SetBinding(target,property,
        new Binding {Source=this,Path=new PropertyPath(nameof(Foreground))});
}
